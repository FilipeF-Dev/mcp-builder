/**
 * COLETOR DE REDE: descobre equipamentos e serviços nas faixas AUTORIZADAS.
 *
 *   1. Descoberta: testa poucas portas comuns em todos os endereços. Responder (aberta ou recusada) = existe.
 *   2. Tabela ARP: acrescenta equipamentos da rede local que bloqueiam todas as portas.
 *   3. Detalhe: nos equipamentos encontrados, testa o catálogo completo de portas.
 *   4. Identificação: nome (DNS reverso), banners e páginas web, catálogo de assinaturas.
 *
 * Velocidade limitada (conexões simultâneas e tempo de espera) para não pesar na rede.
 */
import { redact } from "../../core/redact.js";
import { nowIso } from "../../core/workspace.js";
import type { NetDevice, NetService, SystemMatch } from "../../core/schema.js";
import { SIGNATURES } from "../../signatures/catalog.js";
import { DISCOVERY_PORTS, PORTS, portInfo } from "./ports.js";
import { arpTable, pool, probeHttp, probePort, readBanner, reverseDns } from "./probe.js";
import { expandAll } from "./ranges.js";

export interface ScanOptions {
  /** Portas extras além do catálogo (ex.: a porta de um sistema interno). */
  extraPorts?: number[];
  concurrency?: number;
  timeoutMs?: number;
  onProgress?: (phase: string, done: number, total: number) => void;
}

export interface ScanResult {
  devices: NetDevice[];
  addresses: number;
  ports: number[];
  durationMs: number;
}

export async function scanNetwork(specs: string[], opts: ScanOptions = {}): Promise<ScanResult> {
  const started = Date.now();
  const ips = expandAll(specs);
  const concurrency = opts.concurrency ?? 64;
  const timeout = opts.timeoutMs ?? 800;
  const allPorts = [...new Set([...PORTS.map((p) => p.port), ...(opts.extraPorts ?? [])])].sort((a, b) => a - b);
  const open = new Map<string, Set<number>>();
  const alive = new Set<string>();
  const mark = (ip: string, port: number, state: string) => {
    if (state === "sem-resposta") return;
    alive.add(ip);
    if (state === "aberta") open.set(ip, (open.get(ip) ?? new Set()).add(port));
  };

  // 1. Descoberta
  const disc = ips.flatMap((ip) => DISCOVERY_PORTS.map((port) => ({ ip, port })));
  await pool(disc, concurrency, async ({ ip, port }) => mark(ip, port, await probePort(ip, port, timeout)), (d) => opts.onProgress?.("Procurando equipamentos", d, disc.length));

  // 2. ARP (só enxerga a rede local desta máquina)
  const arp = await arpTable();
  const inScope = new Set(ips);
  for (const ip of arp.keys()) if (inScope.has(ip)) alive.add(ip);

  // 3. Detalhe
  const rest = [...alive].flatMap((ip) => allPorts.filter((p) => !DISCOVERY_PORTS.includes(p)).map((port) => ({ ip, port })));
  await pool(rest, concurrency, async ({ ip, port }) => mark(ip, port, await probePort(ip, port, timeout)), (d) => opts.onProgress?.("Verificando serviços", d, rest.length));

  // 4. Identificação
  const list = [...alive].sort((a, b) => ipNum(a) - ipNum(b));
  const ts = nowIso();
  const devices = await pool(
    list,
    16,
    async (ip): Promise<NetDevice> => {
      const ports = [...(open.get(ip) ?? [])].sort((a, b) => a - b);
      const services: NetService[] = [];
      for (const port of ports) {
        const info = portInfo(port);
        let banner: string | undefined;
        if (info.probe === "banner") banner = await readBanner(ip, port);
        else if (info.probe === "http") banner = await probeHttp(ip, port, false);
        else if (info.probe === "https") banner = await probeHttp(ip, port, true);
        services.push({ port, name: info.name, category: info.category, banner: banner ? redact(banner) : undefined });
      }
      const hostname = await reverseDns(ip);
      return { ip, hostname, mac: arp.get(ip), kind: classify(services), services, systems: matchNetwork(services), firstSeen: ts, lastSeen: ts };
    },
    (d) => opts.onProgress?.("Identificando", d, list.length),
  );

  return { devices, addresses: ips.length, ports: allPorts, durationMs: Date.now() - started };
}

const ipNum = (ip: string) => ip.split(".").reduce((n, o) => n * 256 + Number(o), 0);

/** Tipo provável do equipamento, só pelas portas abertas. É uma hipótese: o relatório deixa isso claro. */
export function classify(services: NetService[]): string {
  const has = (...ports: number[]) => ports.some((p) => services.some((s) => s.port === p));
  const cat = (c: string) => services.some((s) => s.category === c);
  if (!services.length) return "responde na rede, mas bloqueia as portas verificadas";
  if (has(88) && has(389)) return "controlador de domínio (Active Directory)";
  if (has(9100, 515, 631) && !has(445, 22)) return "impressora";
  if (cat("banco-de-dados")) return "servidor de banco de dados";
  if (has(25, 587, 143, 993, 110)) return "servidor de e-mail";
  if (has(445) && (has(80, 443, 8080, 8443) || has(5985))) return "servidor Windows";
  if (has(135, 139, 445)) return "computador Windows";
  if (has(22)) return "servidor Linux ou equipamento de rede";
  if (cat("web")) return "equipamento com página web (roteador, câmera, sistema)";
  return "outro equipamento";
}

/**
 * Assinaturas a partir do que a rede mostra.
 *   banner/página reconhecido = 2 pontos; porta típica = 1 (só se nenhuma outra assinatura usar a mesma porta);
 *   porta de banco de dados = +1 (são bem específicas).
 */
export function matchNetwork(services: NetService[]): SystemMatch[] {
  const owners = new Map<number, number>();
  for (const s of SIGNATURES) for (const p of s.ports ?? []) owners.set(p, (owners.get(p) ?? 0) + 1);
  const out: SystemMatch[] = [];
  for (const sig of SIGNATURES) {
    let score = 0;
    const evidence: string[] = [];
    for (const svc of services) {
      const re = sig.banner ?? sig.software;
      if (svc.banner && re?.test(svc.banner)) {
        score += 2;
        evidence.push(`porta ${svc.port} apresenta: ${svc.banner}`);
      } else if (sig.ports?.includes(svc.port) && owners.get(svc.port) === 1) {
        score += svc.category === "banco-de-dados" ? 2 : 1;
        evidence.push(`porta típica aberta: ${svc.port} (${svc.name})`);
      }
    }
    if (!score) continue;
    if (sig.ambiguous) score -= 1;
    if (score <= 0) continue;
    out.push({ signatureId: sig.id, systemName: sig.name, category: sig.category, confidence: score >= 3 ? "alta" : score >= 2 ? "media" : "baixa", evidence });
  }
  return out;
}
