/**
 * Chaves de acesso do modo HTTP do servidor MCP.
 *
 * Cada pessoa ou aplicação (ex.: "teams", "intranet", "maria-rh") recebe uma chave própria.
 * Só o HASH (SHA-256) é guardado. A chave é mostrada UMA vez, na criação: quem perdeu, revoga e cria outra.
 * Assim, mesmo quem lê os arquivos do servidor não consegue usar as chaves.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import type { Workspace } from "../core/workspace.js";
import { nowIso } from "../core/workspace.js";

const KeySchema = z.object({ nome: z.string(), hash: z.string().regex(/^[0-9a-f]{64}$/), criadaEm: z.string() });
export type AccessKey = z.infer<typeof KeySchema>;
const FILE = "chaves.json";

export function loadKeys(ws: Workspace): AccessKey[] {
  const p = ws.path(FILE);
  return existsSync(p) ? z.array(KeySchema).parse(JSON.parse(readFileSync(p, "utf8"))) : [];
}

function saveKeys(ws: Workspace, keys: AccessKey[]): void {
  writeFileSync(ws.path(FILE), JSON.stringify(keys, null, 2) + "\n", "utf8");
}

export const keyName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

/** Cria uma chave e devolve o valor em texto (única vez em que ele existe fora do cliente). */
export function createKey(ws: Workspace, name: string): string {
  const nome = keyName(name);
  if (!nome) throw new Error("Nome inválido.");
  const keys = loadKeys(ws);
  if (keys.some((k) => k.nome === nome)) throw new Error(`Já existe uma chave chamada "${nome}". Revogue antes de criar outra.`);
  const token = `mcp_${randomBytes(32).toString("base64url")}`;
  keys.push({ nome, hash: createHash("sha256").update(token).digest("hex"), criadaEm: nowIso() });
  saveKeys(ws, keys);
  return token;
}

export function revokeKey(ws: Workspace, name: string): boolean {
  const keys = loadKeys(ws);
  const rest = keys.filter((k) => k.nome !== keyName(name));
  saveKeys(ws, rest);
  return rest.length < keys.length;
}
