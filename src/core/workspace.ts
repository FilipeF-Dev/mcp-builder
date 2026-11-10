import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { ZodType } from "zod";
import {
  ApprovalsSchema,
  type Approvals,
  ChangeSchema,
  ManifestSchema,
  type Change,
  type Host,
  type Manifest,
  CompanyProfileSchema,
  InventorySchema,
  QuestionSchema,
  type CompanyProfile,
  type Inventory,
  type Question,
} from "./schema.js";
import { z } from "zod";

/**
 * Um "workspace" é a pasta com tudo o que se sabe sobre UMA empresa:
 *
 *   workspaces/<slug>/
 *     company.json     camada de negócio (entrevista)
 *     inventory.json   camada técnica (coletores)
 *     questions.json   lacunas a resolver com pessoas
 *     changes.json     diário de mudanças entre análises (só cresce)
 *     generated.json   manifesto: o que foi gerado e de quais fatos depende
 *     historico/       cópia de cada análise anterior, por máquina
 *     aprovacoes.json  decisões do TI (etapa 5) + aprovado/ com as versões aprovadas
 *     saida/           skills, regras de segurança e o servidor MCP
 *     context/         markdown gerado para o agente
 */

export const WORKSPACES_DIR = resolve(process.env.MCP_BUILDER_HOME ?? "workspaces");

export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function nowIso(): string {
  return new Date().toISOString();
}

function readJson<T>(path: string, schema: ZodType<T>): T {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Arquivo inválido: ${path}\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

/** Grava de forma atômica (arquivo temporário + rename) para não corromper em caso de queda. */
function writeJson(path: string, data: unknown): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  renameSync(tmp, path);
}

export class Workspace {
  constructor(public readonly dir: string) {}

  static create(name: string): Workspace {
    const slug = slugify(name);
    if (!slug) throw new Error("Nome de empresa inválido.");
    const dir = join(WORKSPACES_DIR, slug);
    if (existsSync(join(dir, "company.json"))) {
      throw new Error(`Já existe um workspace para "${slug}" em ${dir}`);
    }
    mkdirSync(join(dir, "context"), { recursive: true });
    const ts = nowIso();
    const ws = new Workspace(dir);
    ws.saveCompany({ schemaVersion: 1, name, slug, createdAt: ts, updatedAt: ts, answers: {}, deferred: [] });
    ws.saveInventory({ schemaVersion: 1, updatedAt: ts, hosts: [] });
    ws.saveQuestions([]);
    return ws;
  }

  /** Abre pelo slug; se omitido e houver um único workspace, usa ele. */
  static open(slug?: string): Workspace {
    if (!slug) {
      const all = Workspace.list();
      if (all.length === 0) throw new Error('Nenhum workspace encontrado. Rode: mcp-builder init "Nome da Empresa"');
      if (all.length > 1) throw new Error(`Há vários workspaces (${all.join(", ")}). Informe --empresa <slug>.`);
      slug = all[0];
    }
    const dir = join(WORKSPACES_DIR, slugify(slug));
    if (!existsSync(join(dir, "company.json"))) throw new Error(`Workspace "${slug}" não encontrado em ${WORKSPACES_DIR}`);
    return new Workspace(dir);
  }

  static list(): string[] {
    if (!existsSync(WORKSPACES_DIR)) return [];
    return readdirSync(WORKSPACES_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(WORKSPACES_DIR, d.name, "company.json")))
      .map((d) => d.name);
  }

  path(...parts: string[]): string {
    return join(this.dir, ...parts);
  }

  // company
  loadCompany(): CompanyProfile {
    return readJson(this.path("company.json"), CompanyProfileSchema);
  }
  saveCompany(c: CompanyProfile): void {
    c.updatedAt = nowIso();
    writeJson(this.path("company.json"), c);
  }

  // inventory
  loadInventory(): Inventory {
    return readJson(this.path("inventory.json"), InventorySchema);
  }
  saveInventory(inv: Inventory): void {
    inv.updatedAt = nowIso();
    writeJson(this.path("inventory.json"), inv);
  }

  // questions
  loadQuestions(): Question[] {
    return readJson(this.path("questions.json"), z.array(QuestionSchema));
  }
  saveQuestions(q: Question[]): void {
    writeJson(this.path("questions.json"), q);
  }

  /**
   * Adiciona perguntas evitando duplicatas (mesmo tópico + mesmo texto).
   * Retorna quantas foram realmente adicionadas.
   */
  addQuestions(items: Array<Omit<Question, "id" | "status" | "createdAt">>): number {
    const all = this.loadQuestions();
    const seen = new Set(all.map((q) => `${q.topic}|${q.text}`));
    let added = 0;
    for (const item of items) {
      const key = `${item.topic}|${item.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push({ ...item, id: randomUUID().slice(0, 8), status: "aberta", createdAt: nowIso() });
      added++;
    }
    this.saveQuestions(all);
    return added;
  }

  // mudanças (diário; arquivo opcional para workspaces antigos)
  loadChanges(): Change[] {
    const p = this.path("changes.json");
    return existsSync(p) ? readJson(p, z.array(ChangeSchema)) : [];
  }
  appendChanges(items: Array<Omit<Change, "id" | "at">>): Change[] {
    if (items.length === 0) return [];
    const all = this.loadChanges();
    const at = nowIso();
    const added = items.map((c) => ({ ...c, id: randomUUID().slice(0, 8), at }));
    writeJson(this.path("changes.json"), [...all, ...added]);
    return added;
  }

  // manifesto do que foi gerado
  loadManifest(): Manifest {
    const p = this.path("generated.json");
    return existsSync(p) ? readJson(p, ManifestSchema) : { schemaVersion: 1, artifacts: {} };
  }
  saveManifest(m: Manifest): void {
    writeJson(this.path("generated.json"), m);
  }

  // aprovações (etapa 5)
  loadApprovals(): Approvals {
    const p = this.path("aprovacoes.json");
    return existsSync(p) ? readJson(p, ApprovalsSchema) : { schemaVersion: 1, items: {} };
  }
  saveApprovals(a: Approvals): void {
    writeJson(this.path("aprovacoes.json"), a);
  }

  /** Guarda uma cópia da análise de uma máquina antes de ela ser substituída. */
  archiveHost(host: Host): string {
    const dir = this.path("historico", host.id);
    mkdirSync(dir, { recursive: true });
    const p = join(dir, host.collectedAt.replace(/[:.]/g, "-") + ".json");
    writeJson(p, host);
    return p;
  }

  writeContext(file: string, content: string): string {
    mkdirSync(this.path("context"), { recursive: true });
    const p = this.path("context", file);
    writeFileSync(p, content, "utf8");
    return p;
  }
}
