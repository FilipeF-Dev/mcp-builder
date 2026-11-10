import { networkInterfaces } from "node:os";

/**
 * Faixas de endereços. Aceita:
 *   192.168.1.0/24        (notação CIDR)
 *   192.168.1.10-50       (intervalo no último número)
 *   192.168.1.10          (um endereço)
 * Só IPv4. Limite de endereços por varredura para evitar varreduras acidentais enormes.
 */
export const MAX_ADDRESSES = 4096;

const toInt = (ip: string) => ip.split(".").reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
const toIp = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join(".");
const validIp = (ip: string) => /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && ip.split(".").every((o) => Number(o) <= 255);

export function expandRange(spec: string): string[] {
  const s = spec.trim();
  let m = s.match(/^([\d.]+)\/(\d{1,2})$/);
  if (m) {
    const [, ip, bitsStr] = m;
    const bits = Number(bitsStr);
    if (!validIp(ip) || bits < 8 || bits > 32) throw new Error(`Faixa inválida: ${spec}`);
    const mask = bits === 32 ? 0xffffffff : (~0 << (32 - bits)) >>> 0;
    const net = toInt(ip) & mask;
    const size = 2 ** (32 - bits);
    if (size > MAX_ADDRESSES * 2) throw new Error(`Faixa grande demais: ${spec} (${size} endereços). O limite é ${MAX_ADDRESSES}.`);
    // /31 e /32 usam todos os endereços; nas demais, exclui rede e broadcast.
    const first = bits >= 31 ? net : net + 1;
    const last = bits >= 31 ? net + size - 1 : net + size - 2;
    const out: string[] = [];
    for (let n = first; n <= last; n++) out.push(toIp(n >>> 0));
    return out;
  }
  m = s.match(/^([\d.]+)-(\d{1,3})$/);
  if (m) {
    const [, ip, endStr] = m;
    if (!validIp(ip)) throw new Error(`Faixa inválida: ${spec}`);
    const parts = ip.split(".").map(Number);
    const end = Number(endStr);
    if (end < parts[3] || end > 255) throw new Error(`Faixa inválida: ${spec}`);
    const out: string[] = [];
    for (let i = parts[3]; i <= end; i++) out.push(`${parts[0]}.${parts[1]}.${parts[2]}.${i}`);
    return out;
  }
  if (validIp(s)) return [s];
  throw new Error(`Faixa não reconhecida: "${spec}". Use 192.168.1.0/24, 192.168.1.10-50 ou 192.168.1.10.`);
}

export function expandAll(specs: string[]): string[] {
  const all = [...new Set(specs.flatMap(expandRange))];
  if (all.length > MAX_ADDRESSES) throw new Error(`São ${all.length} endereços; o limite por varredura é ${MAX_ADDRESSES}. Divida em varreduras menores.`);
  return all;
}

export function inRanges(ip: string, specs: string[]): boolean {
  return specs.some((s) => expandRange(s).includes(ip));
}

export interface LocalSubnet {
  cidr: string;
  interfaceName: string;
  address: string;
  /** Adaptadores virtuais (WSL, Hyper-V, VirtualBox, Docker) costumam não ser a rede da empresa. */
  virtual: boolean;
}

/** Sub-redes IPv4 das placas de rede desta máquina: sugestões, nunca usadas sem confirmação. */
export function localSubnets(): LocalSubnet[] {
  const out: LocalSubnet[] = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== "IPv4" || a.internal || !a.cidr) continue;
      const [ip, bits] = a.cidr.split("/");
      const b = Math.max(Number(bits), 20); // nunca sugere algo maior que /20
      const mask = (~0 << (32 - b)) >>> 0;
      out.push({
        cidr: `${toIp((toInt(ip) & mask) >>> 0)}/${b}`,
        interfaceName: name,
        address: a.address,
        virtual: /vethernet|wsl|hyper-v|virtualbox|vmware|docker|vbox|loopback/i.test(name),
      });
    }
  }
  return out;
}
