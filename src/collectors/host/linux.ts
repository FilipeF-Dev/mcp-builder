import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { hostname, cpus, totalmem, arch } from "node:os";
import type { Host } from "../../core/schema.js";

const run = promisify(execFile);

/** Executa um comando somente leitura; em falha, registra aviso e devolve null. */
async function tryRun(cmd: string, args: string[], warnings: string[]): Promise<string | null> {
  try {
    const { stdout } = await run(cmd, args, { maxBuffer: 64 * 1024 * 1024, timeout: 120_000, encoding: "utf8" });
    return stdout;
  } catch (e) {
    warnings.push(`${cmd} ${args.join(" ")}: ${(e as Error).message.split("\n")[0]}`);
    return null;
  }
}

async function tryRead(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

type Partial = Omit<Host, "id" | "collectedAt" | "systems">;

/**
 * Coletor Linux (somente leitura). Usa comandos padrão presentes na maioria
 * das distribuições: dpkg/rpm, systemctl, ss, ip, crontab.
 * Sem root, algumas informações (processo dono da porta, crontabs de outros usuários) ficam incompletas.
 */
export async function collectLinux(): Promise<Partial> {
  const warnings: string[] = [];

  // SO
  const osRelease = (await tryRead("/etc/os-release")) ?? "";
  const osField = (k: string) => osRelease.match(new RegExp(`^${k}="?([^"\\n]*)"?`, "m"))?.[1];

  // Programas
  const software: Partial["software"] = [];
  const dpkg = await tryRun("dpkg-query", ["-W", "-f=${Package}\t${Version}\t${Maintainer}\n"], []);
  if (dpkg) {
    for (const line of dpkg.trim().split("\n")) {
      const [name, version, publisher] = line.split("\t");
      if (name) software.push({ name, version, publisher });
    }
  } else {
    const rpm = await tryRun("rpm", ["-qa", "--qf", "%{NAME}\t%{VERSION}-%{RELEASE}\t%{VENDOR}\n"], []);
    if (rpm) {
      for (const line of rpm.trim().split("\n")) {
        const [name, version, publisher] = line.split("\t");
        if (name) software.push({ name, version, publisher: publisher === "(none)" ? undefined : publisher });
      }
    } else warnings.push("Nenhum gerenciador de pacotes reconhecido (dpkg/rpm).");
  }

  // Serviços
  const services: Partial["services"] = [];
  const units = await tryRun("systemctl", ["list-units", "--type=service", "--all", "--no-pager", "--no-legend", "--plain"], warnings);
  if (units) {
    for (const line of units.trim().split("\n")) {
      const m = line.trim().match(/^(\S+)\.service\s+(\S+)\s+(\S+)\s+(\S+)\s*(.*)$/);
      if (m) services.push({ name: m[1], displayName: m[5] || undefined, state: m[4], startMode: m[2] });
    }
  }

  // Portas em escuta
  const listeningPorts: Partial["listeningPorts"] = [];
  const ss = await tryRun("ss", ["-H", "-lntup"], warnings);
  if (ss) {
    for (const line of ss.trim().split("\n")) {
      const cols = line.trim().split(/\s+/);
      const proto = cols[0]?.startsWith("udp") ? "udp" : "tcp";
      const local = cols[4] ?? "";
      const idx = local.lastIndexOf(":");
      const port = Number(local.slice(idx + 1));
      if (!Number.isFinite(port)) continue;
      const proc = line.match(/users:\(\("([^"]+)",pid=(\d+)/);
      listeningPorts.push({
        protocol: proto,
        address: local.slice(0, idx).replace(/^\[|\]$/g, ""),
        port,
        process: proc?.[1],
        pid: proc ? Number(proc[2]) : undefined,
      });
    }
  }

  // Interfaces
  const interfaces: Partial["interfaces"] = [];
  const ipJson = await tryRun("ip", ["-j", "-4", "addr"], warnings);
  if (ipJson) {
    try {
      for (const ifc of JSON.parse(ipJson) as Array<{ ifname: string; addr_info: Array<{ local: string; prefixlen: number }> }>) {
        if (ifc.ifname === "lo") continue;
        const ips = ifc.addr_info.map((a) => a.local);
        if (ips.length) interfaces.push({ name: ifc.ifname, ipv4: ips, prefixLength: ifc.addr_info[0]?.prefixlen });
      }
    } catch {
      warnings.push("Não foi possível interpretar a saída de 'ip -j addr'.");
    }
  }

  // Tarefas agendadas: /etc/crontab, /etc/cron.d/*, crontab do usuário atual, timers do systemd
  const scheduledTasks: Partial["scheduledTasks"] = [];
  const parseCron = (text: string, source: string, hasUser: boolean) => {
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || /^[A-Z_]+=/.test(line)) continue;
      const parts = line.split(/\s+/);
      const n = line.startsWith("@") ? 1 : 5;
      const runAs = hasUser ? parts[n] : undefined;
      const action = parts.slice(hasUser ? n + 1 : n).join(" ");
      if (action) scheduledTasks.push({ name: `${source}: ${parts.slice(0, n).join(" ")}`, path: source, action, runAs });
    }
  };
  const etcCrontab = await tryRead("/etc/crontab");
  if (etcCrontab) parseCron(etcCrontab, "/etc/crontab", true);
  const cronD = await tryRun("sh", ["-c", "for f in /etc/cron.d/*; do [ -f \"$f\" ] && echo \"### $f\" && cat \"$f\"; done"], []);
  if (cronD) for (const block of cronD.split("### ").filter(Boolean)) {
    const [file, ...rest] = block.split("\n");
    parseCron(rest.join("\n"), file.trim(), true);
  }
  const userCron = await tryRun("crontab", ["-l"], []);
  if (userCron) parseCron(userCron, "crontab do usuário", false);
  const timers = await tryRun("systemctl", ["list-timers", "--all", "--no-pager", "--no-legend"], []);
  if (timers) for (const line of timers.trim().split("\n")) {
    const unit = line.match(/(\S+\.timer)\s+(\S+\.service)/);
    if (unit) scheduledTasks.push({ name: unit[1], path: "systemd", action: unit[2] });
  }

  // ODBC
  const dataSources: Partial["dataSources"] = [];
  for (const file of ["/etc/odbc.ini"]) {
    const text = await tryRead(file);
    if (!text) continue;
    for (const m of text.matchAll(/^\[([^\]]+)\]([\s\S]*?)(?=^\[|$(?![\s\S]))/gm)) {
      const driver = m[2].match(/^\s*Driver\s*=\s*(.+)$/im)?.[1]?.trim();
      dataSources.push({ kind: "odbc", name: m[1], driver, details: m[2].trim().split("\n").map((l) => l.trim()).filter(Boolean).join("; ") });
    }
  }

  const cpuList = cpus();
  return {
    hostname: hostname(),
    collector: "linux@0.1",
    os: { family: "linux", name: osField("PRETTY_NAME") ?? "Linux", version: osField("VERSION_ID"), architecture: arch() },
    hardware: {
      cpu: cpuList[0]?.model,
      cpuCores: cpuList.length,
      memoryGB: Math.round((totalmem() / 1024 ** 3) * 10) / 10,
      model: (await tryRead("/sys/class/dmi/id/product_name"))?.trim() || undefined,
      manufacturer: (await tryRead("/sys/class/dmi/id/sys_vendor"))?.trim() || undefined,
    },
    domain: undefined,
    role: "servidor",
    interfaces,
    software,
    services,
    listeningPorts,
    scheduledTasks,
    dataSources,
    warnings,
  };
}
