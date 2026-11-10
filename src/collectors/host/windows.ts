import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Script PowerShell somente leitura. Cada seção é isolada em try/catch:
 * uma falha (ex.: falta de permissão) vira aviso, não derruba a coleta.
 */
const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$r = [ordered]@{ warnings = @() }
function Section($name, [scriptblock]$block) {
  try { $r[$name] = & $block } catch { $r.warnings += "$($name): $($_.Exception.Message)" }
}

Section 'os' { $o = Get-CimInstance Win32_OperatingSystem; @{ name = $o.Caption; version = $o.Version; arch = $o.OSArchitecture; productType = $o.ProductType } }
Section 'cs' { $c = Get-CimInstance Win32_ComputerSystem; @{ hostname = $c.DNSHostName; domain = $c.Domain; partOfDomain = $c.PartOfDomain; manufacturer = $c.Manufacturer; model = $c.Model; memory = $c.TotalPhysicalMemory; domainRole = $c.DomainRole } }
Section 'cpu' { $p = @(Get-CimInstance Win32_Processor); @{ name = $p[0].Name; cores = ($p | Measure-Object NumberOfCores -Sum).Sum } }

Section 'software' {
  $paths = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
           'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
           'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
  @(Get-ItemProperty $paths -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -and -not $_.SystemComponent -and -not $_.ParentKeyName } |
    ForEach-Object { @{ name = $_.DisplayName; version = $_.DisplayVersion; publisher = $_.Publisher; installDate = $_.InstallDate; installLocation = $_.InstallLocation } })
}

Section 'services' {
  @(Get-CimInstance Win32_Service | ForEach-Object { @{ name = $_.Name; displayName = $_.DisplayName; state = $_.State; startMode = $_.StartMode; command = $_.PathName; account = $_.StartName } })
}

Section 'ports' {
  $procs = @{}; Get-Process | ForEach-Object { $procs[[int]$_.Id] = $_.ProcessName }
  $tcp = @(Get-NetTCPConnection -State Listen | ForEach-Object { @{ protocol = 'tcp'; address = $_.LocalAddress; port = [int]$_.LocalPort; pid = [int]$_.OwningProcess; process = $procs[[int]$_.OwningProcess] } })
  $udp = @(Get-NetUDPEndpoint | Where-Object { $_.LocalAddress -ne '127.0.0.1' -and $_.LocalAddress -ne '::1' } | ForEach-Object { @{ protocol = 'udp'; address = $_.LocalAddress; port = [int]$_.LocalPort; pid = [int]$_.OwningProcess; process = $procs[[int]$_.OwningProcess] } })
  $tcp + $udp
}

Section 'tasks' {
  @(Get-ScheduledTask | Where-Object { $_.TaskPath -notlike '\Microsoft\*' } | ForEach-Object {
    $a = $_.Actions | Select-Object -First 1
    @{ name = $_.TaskName; path = $_.TaskPath; state = [string]$_.State; action = (("$($a.Execute) $($a.Arguments)").Trim()); runAs = $_.Principal.UserId }
  })
}

Section 'odbc' {
  @(Get-OdbcDsn | ForEach-Object { @{ name = $_.Name; driver = $_.DriverName; type = [string]$_.DsnType; platform = [string]$_.Platform; attrs = (($_.Attribute.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join '; ') } })
}

Section 'interfaces' {
  @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.PrefixOrigin -ne 'WellKnown' } |
    ForEach-Object { @{ name = $_.InterfaceAlias; ip = $_.IPAddress; prefix = [int]$_.PrefixLength } })
}

$r | ConvertTo-Json -Depth 5 -Compress
`;

export interface RawWindows {
  warnings: string[];
  os?: { name: string; version: string; arch: string; productType: number };
  cs?: {
    hostname: string;
    domain: string;
    partOfDomain: boolean;
    manufacturer: string;
    model: string;
    memory: number;
    domainRole: number;
  };
  cpu?: { name: string; cores: number };
  software?: Array<Record<string, string | null>>;
  services?: Array<Record<string, string | null>>;
  ports?: Array<{ protocol: "tcp" | "udp"; address: string; port: number; pid: number; process: string | null }>;
  tasks?: Array<Record<string, string | null>>;
  odbc?: Array<Record<string, string | null>>;
  interfaces?: Array<{ name: string; ip: string; prefix: number }>;
}

/** PowerShell serializa arrays de 1 item como objeto; normaliza. */
function arr<T>(v: T[] | T | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export async function collectWindowsRaw(): Promise<RawWindows> {
  const encoded = Buffer.from(SCRIPT, "utf16le").toString("base64");
  const { stdout } = await run(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
    { maxBuffer: 64 * 1024 * 1024, windowsHide: true, encoding: "utf8", timeout: 5 * 60_000 },
  );
  const data = JSON.parse(stdout.trim().replace(/^﻿/, "")) as RawWindows;
  for (const k of ["software", "services", "ports", "tasks", "odbc", "interfaces", "warnings"] as const) {
    (data as unknown as Record<string, unknown>)[k] = arr((data as unknown as Record<string, unknown>)[k] as never);
  }
  return data;
}
