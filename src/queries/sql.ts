/**
 * SQL das consultas: validação (somente leitura) e geração pelo assistente.
 *
 * A validação é a PRIMEIRA de três camadas. As outras duas ficam no servidor:
 * transação somente leitura (PostgreSQL) e um usuário de banco só com permissão de leitura.
 * O servidor repete esta mesma validação ao iniciar (templates/servidor-mcp/servidor.js).
 */
import type { Engine } from "../collectors/database/readers.js";
import type { DbTable, QueryParam } from "../core/schema.js";

/** Palavras que nunca podem aparecer: escrita, estrutura, permissões, execução de código, arquivos, espera. */
const FORBIDDEN = [
  "insert", "update", "delete", "merge", "upsert", "replace", "drop", "alter", "create", "truncate", "rename",
  "grant", "revoke", "deny", "exec", "execute", "call", "do", "into", "copy", "vacuum", "analyze", "reindex",
  "cluster", "lock", "set", "reset", "begin", "commit", "rollback", "savepoint", "declare", "open", "fetch",
  "dbcc", "bulk", "openrowset", "opendatasource", "openquery", "shutdown", "kill", "backup", "restore",
  "waitfor", "pg_sleep", "pg_read_file", "pg_read_binary_file", "pg_ls_dir", "lo_import", "lo_export",
  "dblink", "load_file", "outfile", "listen", "notify", "refresh", "security", "pg_terminate_backend",
];

/** Aplica `fn` só nos trechos FORA de textos entre aspas simples. */
export function outsideStrings(sql: string, fn: (part: string) => string): string {
  return sql
    .split(/('(?:[^']|'')*')/)
    .map((part, i) => (i % 2 === 1 ? part : fn(part)))
    .join("");
}

/** :nome fora de textos, ignorando conversões do PostgreSQL (::int). */
export const PARAM_RE = /(?<![:\w]):([a-z_][a-z0-9_]*)/gi;

export function placeholders(sql: string): string[] {
  const found = new Set<string>();
  outsideStrings(sql, (part) => {
    for (const m of part.matchAll(PARAM_RE)) found.add(m[1].toLowerCase());
    return part;
  });
  return [...found];
}

/** Retorna a lista de problemas (vazia = válida). Mensagens em linguagem simples. */
export function validateSql(sql: string, params: QueryParam[]): string[] {
  const errors: string[] = [];
  const text = sql.trim().replace(/;\s*$/, "");
  if (/--|\/\*/.test(outsideStrings(text, (p) => p))) errors.push("Comentários não são permitidos na consulta.");
  const code = outsideStrings(text, (p) => p).replace(/'(?:[^']|'')*'/g, "''");
  if (code.includes(";")) errors.push("Só é permitido um comando por consulta.");
  if (!/^\s*(select|with)\b/i.test(code)) errors.push("A consulta precisa começar com SELECT (ou WITH).");
  const words = new Set(code.toLowerCase().match(/[a-z_][a-z0-9_]*/g) ?? []);
  const bad = FORBIDDEN.filter((w) => words.has(w));
  if (bad.length) errors.push(`Palavras não permitidas (a consulta deve só ler): ${bad.join(", ")}.`);
  if (/\b(xp|sp)_\w+/i.test(code)) errors.push("Procedimentos do sistema (xp_/sp_) não são permitidos.");

  const used = placeholders(text);
  const declared = params.map((p) => p.name);
  const missing = used.filter((u) => !declared.includes(u));
  const unused = declared.filter((d) => !used.includes(d));
  if (missing.length) errors.push(`Parâmetros usados mas não declarados: ${missing.join(", ")}.`);
  if (unused.length) errors.push(`Parâmetros declarados mas não usados: ${unused.join(", ")}.`);
  return errors;
}

// ─────────────────────────── Gerador (assistente) ───────────────────────────

const quote = (engine: Engine, id: string) => (engine === "postgres" ? `"${id.replace(/"/g, '""')}"` : `[${id.replace(/]/g, "]]")}]`);

export function paramType(dbType: string): QueryParam["type"] {
  const t = dbType.toLowerCase();
  if (/int|numeric|decimal|money|float|real|double|serial|bit/.test(t)) return "numero";
  if (/date|time/.test(t)) return "data";
  return "texto";
}

export function paramName(column: string): string {
  return (
    column
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^(\d)/, "p_$1") || "valor"
  );
}

export interface Filter {
  column: string;
  /** "igual": valor exato. "contem": parte do texto, sem diferenciar maiúsculas (só para texto). */
  op: "igual" | "contem";
}

export function buildSelect(
  engine: Engine,
  table: DbTable,
  columns: string[],
  filters: Filter[],
  orderBy: { column: string; desc: boolean } | undefined,
  maxRows: number,
): { sql: string; params: QueryParam[] } {
  const q = (id: string) => quote(engine, id);
  const params: QueryParam[] = [];
  const where = filters.map((f) => {
    const col = table.columns.find((c) => c.name === f.column)!;
    let name = paramName(f.column);
    while (params.some((p) => p.name === name)) name += "_2";
    params.push({ name, type: f.op === "contem" ? "texto" : paramType(col.type), description: `${f.op === "contem" ? "Parte do valor de" : "Valor de"} ${f.column}`, required: true });
    if (f.op === "igual") return `${q(f.column)} = :${name}`;
    return engine === "postgres" ? `${q(f.column)}::text ILIKE '%' || :${name} || '%'` : `${q(f.column)} LIKE '%' + :${name} + '%'`;
  });
  const cols = columns.map(q).join(", ");
  const from = `${q(table.schema)}.${q(table.name)}`;
  const order = orderBy ? ` ORDER BY ${q(orderBy.column)}${orderBy.desc ? " DESC" : ""}` : "";
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const sql =
    engine === "postgres"
      ? `SELECT ${cols} FROM ${from}${whereSql}${order} LIMIT ${maxRows}`
      : `SELECT TOP (${maxRows}) ${cols} FROM ${from}${whereSql}${order}`;
  return { sql, params };
}
