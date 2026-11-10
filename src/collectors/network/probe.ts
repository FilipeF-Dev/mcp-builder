/**
 * Sondas de rede de baixo nível. Todas são PASSIVAS no sentido de que só abrem uma
 * conexão comum (como um navegador faria), leem o que o serviço apresenta e fecham.
 * Nenhum login, nenhum envio de dados além de um GET / em serviços web.
 */
import { connect } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { TLSSocket } from "node:tls";
import { reverse } from "node:dns/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:os";

export type PortState = "aberta" | "fechada" | "sem-resposta";

/** Tenta conectar. "fechada" (recusou) ainda prova que o equipamento existe. */
export function probePort(ip: string, port: number, timeoutMs: number): Promise<PortState> {
  return new Promise((resolve) => {
    const s = connect({ host: ip, port });
    let done = false;
    const finish = (r: PortState) => {
      if (done) return;
      done = true;
      s.destroy();
      resolve(r);
    };
    s.setTimeout(timeoutMs, () => finish("sem-resposta"));
    s.once("connect", () => finish("aberta"));
    s.once("error", (e: NodeJS.ErrnoException) => finish(e.code === "ECONNREFUSED" ? "fechada" : "sem-resposta"));
  });
}

/** Lê a primeira linha que o serviço envia sozinho (SSH, FTP, SMTP, POP, IMAP, MySQL, VNC). */
export function readBanner(ip: string, port: number, timeoutMs = 2000): Promise<string | undefined> {
  return new Promise((resolve) => {
    const s = connect({ host: ip, port });
    let buf = "";
    const finish = () => {
      s.destroy();
      const line = buf.replace(/[^\x20-\x7e -ÿ]+/g, " ").trim().slice(0, 160);
      resolve(line || undefined);
    };
    s.setTimeout(timeoutMs, finish);
    s.on("data", (d) => {
      buf += d.toString("latin1");
      if (buf.includes("\n") || buf.length > 200) finish();
    });
    s.once("error", finish);
    s.once("end", finish);
  });
}

/** GET / num serviço web: cabeçalho Server, <title> e, em HTTPS, o nome do certificado. */
export function probeHttp(ip: string, port: number, tls: boolean, timeoutMs = 3000): Promise<string | undefined> {
  return new Promise((resolve) => {
    const req = (tls ? httpsRequest : httpRequest)(
      {
        host: ip,
        port,
        path: "/",
        method: "GET",
        timeout: timeoutMs,
        headers: { "User-Agent": "MCP-Builder/inventario-somente-leitura" },
        ...(tls ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        const parts: string[] = [];
        if (res.headers.server) parts.push(`Server: ${res.headers.server}`);
        if (tls) {
          const cert = (res.socket as TLSSocket).getPeerCertificate?.();
          const cn = cert?.subject?.CN;
          if (cn) parts.push(`certificado: ${Array.isArray(cn) ? cn[0] : cn}`);
        }
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) parts.push(`redireciona para ${res.headers.location}`);
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => {
          body += c;
          if (body.length > 65536) res.destroy();
        });
        const end = () => {
          const title = body.match(/<title[^>]*>([^<]{1,120})<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
          if (title) parts.push(`título: ${title}`);
          resolve(parts.length ? parts.join(" · ") : undefined);
        };
        res.on("end", end);
        res.on("close", end);
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(undefined));
    req.end();
  });
}

export async function reverseDns(ip: string): Promise<string | undefined> {
  try {
    const names = await Promise.race([reverse(ip), new Promise<string[]>((_, rej) => setTimeout(() => rej(new Error("timeout")), 2000))]);
    return names[0];
  } catch {
    return undefined;
  }
}

/**
 * Tabela ARP desta máquina: equipamentos da rede local que responderam recentemente,
 * mesmo que bloqueiem todas as portas. Retorna IP → MAC.
 */
export async function arpTable(): Promise<Map<string, string>> {
  const run = promisify(execFile);
  const out = new Map<string, string>();
  try {
    if (platform() === "win32") {
      const { stdout } = await run("arp", ["-a"], { windowsHide: true, encoding: "latin1" });
      for (const m of stdout.matchAll(/^\s*(\d+\.\d+\.\d+\.\d+)\s+([0-9a-f]{2}(?:-[0-9a-f]{2}){5})\s/gim)) {
        if (!/^ff-ff-ff|^01-00-5e/i.test(m[2])) out.set(m[1], m[2].toLowerCase().replace(/-/g, ":"));
      }
    } else {
      const { stdout } = await run("ip", ["neigh"], { encoding: "utf8" });
      for (const m of stdout.matchAll(/^(\d+\.\d+\.\d+\.\d+)\s.*lladdr\s+([0-9a-f:]{17})/gim)) out.set(m[1], m[2].toLowerCase());
    }
  } catch {
    /* sem ARP disponível: segue sem */
  }
  return out;
}

/** Executa tarefas com no máximo `limit` ao mesmo tempo (para não sobrecarregar a rede). */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>, onDone?: (done: number) => void): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
      onDone?.(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
