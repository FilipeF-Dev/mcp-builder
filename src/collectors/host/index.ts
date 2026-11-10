import { platform } from "node:os";
import type { Host } from "../../core/schema.js";
import { HostSchema } from "../../core/schema.js";
import { nowIso, slugify } from "../../core/workspace.js";
import { redact, redactDeep } from "../../core/redact.js";
import { matchSignatures } from "../../signatures/match.js";
import { collectWindowsRaw, type RawWindows } from "./windows.js";
import { collectLinux } from "./linux.js";

const ROLE_BY_PRODUCT_TYPE: Record<number, string> = {
  1: "estação de trabalho",
  2: "controlador de domínio",
  3: "servidor",
};

const s = (v: unknown): string | undefined => (v == null || v === "" ? undefined : String(v));

function normalizeWindows(raw: RawWindows): Omit<Host, "id" | "collectedAt" | "systems"> {
  const ifaces = new Map<string, { name: string; ipv4: string[]; prefixLength?: number }>();
  for (const i of raw.interfaces ?? []) {
    const cur = ifaces.get(i.name) ?? { name: i.name, ipv4: [], prefixLength: i.prefix };
    cur.ipv4.push(i.ip);
    ifaces.set(i.name, cur);
  }
  return {
    hostname: raw.cs?.hostname ?? "desconhecido",
    collector: "windows@0.1",
    os: { family: "windows", name: raw.os?.name ?? "Windows", version: raw.os?.version, architecture: raw.os?.arch },
    hardware: {
      manufacturer: raw.cs?.manufacturer,
      model: raw.cs?.model,
      cpu: raw.cpu?.name?.trim(),
      cpuCores: raw.cpu?.cores,
      memoryGB: raw.cs?.memory ? Math.round((raw.cs.memory / 1024 ** 3) * 10) / 10 : undefined,
    },
    domain: raw.cs?.partOfDomain ? raw.cs.domain : undefined,
    role: raw.os ? ROLE_BY_PRODUCT_TYPE[raw.os.productType] : undefined,
    interfaces: [...ifaces.values()],
    software: (raw.software ?? [])
      .map((x) => ({ name: s(x.name)!, version: s(x.version), publisher: s(x.publisher), installDate: s(x.installDate), installLocation: s(x.installLocation) }))
      .filter((x) => x.name)
      .sort((a, b) => a.name.localeCompare(b.name)),
    services: (raw.services ?? []).map((x) => ({
      name: s(x.name)!,
      displayName: s(x.displayName),
      state: s(x.state),
      startMode: s(x.startMode),
      command: s(x.command),
      account: s(x.account),
    })),
    listeningPorts: (raw.ports ?? []).map((p) => ({ protocol: p.protocol, address: p.address, port: p.port, process: s(p.process), pid: p.pid })),
    scheduledTasks: (raw.tasks ?? []).map((t) => ({ name: s(t.name)!, path: s(t.path), state: s(t.state), action: s(t.action), runAs: s(t.runAs) })),
    dataSources: (raw.odbc ?? []).map((d) => ({
      kind: `odbc (${s(d.type) ?? "?"}, ${s(d.platform) ?? "?"})`,
      name: s(d.name)!,
      driver: s(d.driver),
      details: s(d.attrs),
    })),
    warnings: raw.warnings ?? [],
  };
}

/** Coleta o host LOCAL (a máquina onde o MCP-Builder está rodando). */
export async function collectLocalHost(): Promise<Host> {
  const os = platform();
  let base: Omit<Host, "id" | "collectedAt" | "systems">;
  if (os === "win32") base = normalizeWindows(await collectWindowsRaw());
  else if (os === "linux") base = await collectLinux();
  else throw new Error(`Sistema operacional "${os}" ainda não suportado pelo coletor de host.`);

  // Segredos mascarados ANTES de qualquer outra etapa.
  const clean = redactDeep(base);
  clean.warnings = clean.warnings.map((w) => redact(w));

  const host: Host = {
    ...clean,
    id: slugify(clean.hostname),
    collectedAt: nowIso(),
    systems: matchSignatures(clean),
  };
  return HostSchema.parse(host);
}
