/**
 * COLETOR DE BANCOS DE DADOS: lê a ESTRUTURA (nunca os dados) e interpreta.
 */
import { userInfo } from "node:os";
import type { Change, Database, DbStructure, Question } from "../../core/schema.js";
import { nowIso, slugify } from "../../core/workspace.js";
import { databaseFacts, diffFacts, type Facts } from "../../core/facts.js";
import { READERS, type DbTarget } from "./readers.js";
import { businessAreas, largestTables, matchDatabase, sensitiveColumns } from "./interpret.js";

type NewChange = Omit<Change, "id" | "at">;
type NewQuestion = Omit<Question, "id" | "status" | "createdAt">;

export function databaseId(t: Pick<DbTarget, "engine" | "host" | "port">, database: string): string {
  return slugify(`${t.engine}-${t.host}-${t.port}-${database}`);
}

export async function readDatabase(t: DbTarget, database: string): Promise<{ summary: Database; structure: DbStructure }> {
  const { serverVersion, structure: s } = await READERS[t.engine].read(t, database);
  const id = databaseId(t, database);
  const structure: DbStructure = { id, ...s };
  const summary: Database = {
    id,
    engine: t.engine,
    host: t.host,
    port: t.port,
    database,
    serverVersion,
    collectedAt: nowIso(),
    by: userInfo().username,
    dbUser: t.user,
    tables: s.tables.filter((x) => x.kind === "tabela").length,
    views: s.tables.filter((x) => x.kind === "view").length,
    routines: s.routines.length,
    largestTables: largestTables(s),
    areas: businessAreas(s),
    systems: matchDatabase(database, s),
    sensitive: sensitiveColumns(s),
    structureFile: `bancos/${id}.json`,
  };
  return { summary, structure };
}

/** Fatos por tabela (só para comparar duas leituras do mesmo banco). */
function tableFacts(s: DbStructure): Facts {
  const f: Facts = {};
  for (const t of s.tables) f[`tabela:${t.schema}.${t.name}`] = `${t.kind}: ${t.columns.map((c) => c.name).join(", ")}`;
  return f;
}

const label = (d: Database) => `${d.database} (${d.host})`;

/** Mudanças entre duas leituras do mesmo banco. Muitas mudanças de tabela viram um resumo só. */
export function compareDatabase(prev: { summary: Database; structure?: DbStructure }, next: { summary: Database; structure: DbStructure }): { changes: NewChange[]; questions: NewQuestion[] } {
  const changes: NewChange[] = [];
  const questions: NewQuestion[] = [];
  const subject = `banco:${next.summary.id}`;

  for (const d of diffFacts(databaseFacts([prev.summary]), databaseFacts([next.summary]))) {
    if (d.key.startsWith("dados-sensiveis:")) continue;
    const area = d.key.split(":")[2];
    const item = d.key.split(":").slice(3).join(":") || area;
    let importance: Change["importance"] = "media";
    let summary = `${d.kind === "adicionado" ? "Novo" : d.kind === "removido" ? "Sumiu" : "Mudou"} em ${label(next.summary)}: ${area} ${item}`;
    if (area === "sistema") {
      importance = "alta";
      summary = d.kind === "adicionado" ? `Sistema reconhecido no banco ${label(next.summary)}: ${d.after}` : `Sistema não reconhecido mais no banco ${label(next.summary)}: ${d.before}`;
      questions.push({ layer: "tecnico", topic: subject, text: `${summary}. O que mudou?`, context: "Mudança entre duas leituras do mesmo banco.", source: "comparacao", askWho: "TI" });
    } else if (area === "sensivel") {
      importance = d.kind === "adicionado" ? "alta" : "media";
      summary = d.kind === "adicionado" ? `Nova coluna com dado sensível (${d.after}) em ${label(next.summary)}: ${item}` : `Coluna sensível removida em ${label(next.summary)}: ${item}`;
    } else if (area === "area") {
      summary = d.kind === "adicionado" ? `Nova área de negócio no banco ${label(next.summary)}: ${d.after}` : `Área de negócio não aparece mais no banco ${label(next.summary)}: ${d.before}`;
    } else if (area === "motor" || area === "tamanho") {
      importance = "baixa";
      summary = `${label(next.summary)}: ${d.before} → ${d.after}`;
    }
    changes.push({ layer: "tecnico", subject, kind: d.kind, area: area === "sensivel" ? "dado sensível" : area, item, before: d.before, after: d.after, importance, summary, factKeys: [d.key] });
  }

  if (prev.structure) {
    const td = diffFacts(tableFacts(prev.structure), tableFacts(next.structure));
    const add = td.filter((x) => x.kind === "adicionado");
    const rem = td.filter((x) => x.kind === "removido");
    const alt = td.filter((x) => x.kind === "alterado");
    const name = (k: string) => k.slice("tabela:".length);
    const one = (kind: Change["kind"], list: typeof td, verb: string) => {
      if (!list.length) return;
      const names = list.map((x) => name(x.key));
      changes.push({
        layer: "tecnico",
        subject,
        kind,
        area: "tabela",
        item: names.length === 1 ? names[0] : `${names.length} tabelas`,
        importance: "media",
        summary: `${list.length} tabela(s) ${verb} em ${label(next.summary)}: ${names.slice(0, 5).join(", ")}${names.length > 5 ? "..." : ""}`,
        factKeys: list.map((x) => `banco:${next.summary.id}:${x.key}`),
      });
    };
    one("adicionado", add, "nova(s)");
    one("removido", rem, "removida(s)");
    one("alterado", alt, "com colunas alteradas");
  }
  return { changes, questions };
}

/** Perguntas sobre o que a estrutura não deixa claro. */
export function analyzeDatabase(d: Database): NewQuestion[] {
  const out: NewQuestion[] = [];
  const base = { layer: "tecnico" as const, topic: `banco:${d.id}`, source: "coletor:banco", askWho: "TI" };
  if (!d.systems.length && d.tables > 0) {
    const big = d.largestTables.slice(0, 3).map((t) => t.name).join(", ");
    out.push({ ...base, text: `O banco "${d.database}" em ${d.host} (${d.tables} tabelas) pertence a qual sistema?`, context: big ? `Maiores tabelas: ${big}. Áreas sugeridas: ${d.areas.join(", ") || "nenhuma"}.` : "Banco sem estatísticas de tamanho." });
  }
  if (d.sensitive.some((s) => s.kind === "senha")) {
    out.push({ ...base, text: `O banco "${d.database}" tem colunas de senha. Elas são guardadas com criptografia (hash) ou em texto?`, context: d.sensitive.filter((s) => s.kind === "senha").map((s) => s.column).slice(0, 5).join(", ") });
  }
  return out;
}
