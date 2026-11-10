import { createHash } from "node:crypto";
import { confidenceLabel } from "./labels.js";
import type { CompanyProfile, Host, Inventory, Question } from "./schema.js";

/**
 * FATOS: tudo o que se sabe sobre a empresa, achatado em pares chave → valor legível.
 *
 *   empresa:ramo                         → "Alimentação / food service"
 *   host:srv01:sistema:sqlserver         → "Microsoft SQL Server (banco-de-dados)"
 *   host:srv01:porta:tcp/1433            → "sqlservr"
 *   pendencia:ab12cd34                   → "É o ERP de produção"
 *
 * É a base da atualização incremental:
 *   - comparar os fatos de duas análises mostra exatamente o que mudou;
 *   - cada arquivo gerado declara de quais prefixos de fatos depende, e só é
 *     regenerado quando a impressão digital desses fatos muda.
 *
 * As chaves precisam ser ESTÁVEIS: nada de PID, data ou sufixos aleatórios.
 */
export type Facts = Record<string, string>;

/** Portas de descoberta automática da rede local: ruído, não representam sistemas. */
export const DISCOVERY_PORTS = new Set([137, 138, 1900, 3702, 5353, 5355]);

export const isLoopback = (addr: string) => addr === "127.0.0.1" || addr === "::1" || addr.startsWith("127.");

/** Remove números de versão e sufixos aleatórios para a chave não mudar a cada atualização. */
function stableKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/_[0-9a-f]{4,}$/i, "") // serviços por usuário do Windows: CDPUserSvc_3f2a1
    .replace(/\bv?\d+(\.\d+)+\b/g, "") // 7-zip 26.00 → 7-zip
    .replace(/\(x64\)|\(x86\)|\(64-bit\)|\(32-bit\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const fmt = (v: unknown) => (Array.isArray(v) ? v.join("; ") : String(v));

export function companyFacts(c: CompanyProfile): Facts {
  const f: Facts = { "empresa:nome": c.name };
  for (const [id, a] of Object.entries(c.answers)) {
    const v = fmt(a.value);
    if (v) f[`empresa:${id}`] = v;
  }
  for (const id of c.deferred) if (!(id in c.answers)) f[`empresa:${id}`] = "(pendente)";
  return f;
}

export function hostFacts(h: Host): Facts {
  const p = `host:${h.id}`;
  const f: Facts = {
    [`${p}:papel`]: h.role ?? "?",
    [`${p}:sistema-operacional`]: `${h.os.name}${h.os.version ? ` ${h.os.version}` : ""}`,
    [`${p}:rede`]: h.interfaces.flatMap((i) => i.ipv4).sort().join(", "),
  };
  if (h.domain) f[`${p}:dominio`] = h.domain;
  for (const s of h.systems) f[`${p}:sistema:${s.signatureId}`] = `${s.systemName} (certeza ${confidenceLabel(s.confidence)})`;
  for (const s of h.software) f[`${p}:programa:${stableKey(s.name)}`] = `${s.name}${s.version && !s.name.includes(s.version) ? ` ${s.version}` : ""}`;
  for (const s of h.services) f[`${p}:servico:${stableKey(s.name)}`] = `${s.displayName ?? s.name} [${s.startMode ?? "?"}] ${s.command ?? ""}`.trim();
  for (const s of h.listeningPorts) {
    if (isLoopback(s.address) || s.port >= 49152 || DISCOVERY_PORTS.has(s.port)) continue;
    f[`${p}:porta:${s.protocol}/${s.port}`] = s.process ?? "?";
  }
  for (const t of h.scheduledTasks) f[`${p}:tarefa:${stableKey(`${t.path ?? ""}${t.name}`)}`] = `${t.name}: ${t.action ?? "?"}`;
  for (const d of h.dataSources) f[`${p}:odbc:${stableKey(d.name)}`] = `${d.name} (${d.driver ?? "?"}) ${d.details ?? ""}`.trim();
  return f;
}

/** Pergunta feita por um modelo de skill (tópico "skill:<skill>:<chave>"): a resposta vira fato estável. */
export const SKILL_TOPIC = "skill:";

export function questionFacts(qs: Question[]): Facts {
  const f: Facts = {};
  for (const q of qs) {
    if (q.status !== "respondida" || !q.answer) continue;
    if (q.topic.startsWith(SKILL_TOPIC)) f[`skill-info:${q.topic.slice(SKILL_TOPIC.length)}`] = q.answer;
    else f[`pendencia:${q.id}`] = `${q.text} → ${q.answer}`;
  }
  return f;
}

/**
 * Fatos DERIVADOS, independentes de máquina: "qual sistema existe e onde".
 *   sistema:teknisa      → "Teknisa em: SRV01, CAIXA02"
 *   categoria:email      → "Microsoft Exchange Server"
 * Permitem que uma skill dependa de "existe um servidor de e-mail" sem depender
 * de tudo o que acontece em cada máquina.
 */
export function systemFacts(inv: Inventory): Facts {
  const bySig = new Map<string, { name: string; hosts: string[] }>();
  const byCat = new Map<string, Set<string>>();
  for (const h of inv.hosts) {
    for (const s of h.systems) {
      const cur = bySig.get(s.signatureId) ?? { name: s.systemName, hosts: [] };
      cur.hosts.push(h.hostname);
      bySig.set(s.signatureId, cur);
      byCat.set(s.category, (byCat.get(s.category) ?? new Set()).add(s.systemName));
    }
  }
  const f: Facts = {};
  for (const [id, v] of bySig) f[`sistema:${id}`] = `${v.name} em: ${v.hosts.sort().join(", ")}`;
  for (const [cat, names] of byCat) f[`categoria:${cat}`] = [...names].sort().join("; ");
  return f;
}

export function allFacts(company: CompanyProfile, inv: Inventory, qs: Question[]): Facts {
  return Object.assign({}, companyFacts(company), ...inv.hosts.map(hostFacts), systemFacts(inv), questionFacts(qs));
}

/** Impressão digital dos fatos que começam com algum dos prefixos. */
export function fingerprint(facts: Facts, prefixes: string[]): string {
  const h = createHash("sha256");
  for (const k of Object.keys(facts).sort()) {
    if (prefixes.some((p) => k.startsWith(p))) h.update(`${k}=${facts[k]}\n`);
  }
  return h.digest("hex").slice(0, 16);
}

export interface FactDiff {
  key: string;
  kind: "adicionado" | "removido" | "alterado";
  before?: string;
  after?: string;
}

export function diffFacts(before: Facts, after: Facts): FactDiff[] {
  const out: FactDiff[] = [];
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[k];
    const b = after[k];
    if (a === b) continue;
    out.push({ key: k, kind: a === undefined ? "adicionado" : b === undefined ? "removido" : "alterado", before: a, after: b });
  }
  return out.sort((x, y) => x.key.localeCompare(y.key));
}
