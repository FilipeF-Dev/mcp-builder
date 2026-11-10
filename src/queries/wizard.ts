/**
 * Assistente de consultas: cria consultas sem escrever SQL.
 * Banco → finalidade → tabela → colunas mostradas → filtros → ordem → limite → revisão do SQL gerado.
 */
import type { Workspace } from "../core/workspace.js";
import { nowIso } from "../core/workspace.js";
import type { Prompter } from "../core/prompt.js";
import type { Database, DbTable, Query, QueryParam } from "../core/schema.js";
import { ui } from "../core/ui.js";
import { ENGINE_LABEL } from "../collectors/database/readers.js";
import { buildSelect, paramType, placeholders, validateSql, type Filter } from "./sql.js";

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "consulta";

/** Lê uma lista de números (1,3,5) e devolve os itens escolhidos. */
function pickMany<T>(raw: string | null | undefined, list: T[]): T[] {
  if (!raw?.trim()) return [];
  return [...new Set(raw.split(/[,\s]+/).map((x) => list[Number(x) - 1]).filter((x): x is T => x !== undefined))];
}

export function listQueriesText(ws: Workspace): void {
  const qs = ws.loadQueries().queries;
  const dbs = ws.loadInventory().databases;
  if (!qs.length) {
    console.log(ui.dim("\nNenhuma consulta criada ainda."));
    return;
  }
  console.log(ui.bold("\nConsultas criadas:"));
  for (const q of qs) {
    const db = dbs.find((d) => d.id === q.databaseId);
    console.log(`  - ${ui.bold(q.title)} ${ui.dim(`(consultar_${q.id}, rev. ${q.revision}, banco ${db?.database ?? "?"})`)}`);
    console.log(ui.dim(`    ${q.description}`));
    console.log(ui.dim(`    Parâmetros: ${q.params.map((p) => `${p.name} (${p.type})`).join(", ") || "nenhum"}`));
  }
}

/** Salva (criando ou substituindo). Substituir aumenta a revisão: volta para aprovação. */
export function saveQuery(ws: Workspace, q: Omit<Query, "revision" | "createdAt" | "updatedAt">): Query {
  const file = ws.loadQueries();
  const old = file.queries.find((x) => x.id === q.id);
  const full: Query = { ...q, revision: (old?.revision ?? 0) + 1, createdAt: old?.createdAt ?? nowIso(), updatedAt: nowIso() };
  file.queries = [...file.queries.filter((x) => x.id !== q.id), full];
  ws.saveQueries(file);
  return full;
}

export function removeQuery(ws: Workspace, id: string): boolean {
  const file = ws.loadQueries();
  const before = file.queries.length;
  file.queries = file.queries.filter((q) => q.id !== id);
  ws.saveQueries(file);
  return file.queries.length < before;
}

async function chooseDatabase(ws: Workspace, p: Prompter): Promise<Database | undefined> {
  const dbs = ws.loadInventory().databases.filter((d) => d.tables > 0);
  if (!dbs.length) {
    console.log(ui.yellow("\nPrimeiro leia a estrutura de um banco (Mapear a tecnologia → Ler a estrutura de um banco)."));
    return undefined;
  }
  console.log(ui.bold("\nEm qual banco?"));
  dbs.forEach((d, i) => console.log(`  ${ui.cyan(String(i + 1))}. ${d.database} ${ui.dim(`(${ENGINE_LABEL[d.engine]} em ${d.host}; ${d.areas.join(", ") || "sem áreas"})`)}`));
  return dbs[Number((await p.ask("> "))?.trim()) - 1];
}

async function chooseTable(tables: DbTable[], p: Prompter): Promise<DbTable | undefined> {
  for (;;) {
    const term = (await p.ask("\nDigite parte do nome da tabela (ex.: pedido, cliente) ou Enter para voltar: "))?.trim().toLowerCase();
    if (!term) return undefined;
    const found = tables.filter((t) => `${t.schema}.${t.name}`.toLowerCase().includes(term)).slice(0, 20);
    if (!found.length) {
      console.log(ui.yellow("Nenhuma tabela com esse nome."));
      continue;
    }
    found.forEach((t, i) => console.log(`  ${ui.cyan(String(i + 1))}. ${t.schema}.${t.name} ${ui.dim(`(${t.kind}${t.approxRows ? `, ~${t.approxRows.toLocaleString("pt-BR")} linhas` : ""})`)}`));
    const t = found[Number((await p.ask("Qual? > "))?.trim()) - 1];
    if (t) return t;
  }
}

/** Assistente completo. Retorna a consulta salva, ou undefined se cancelado. */
export async function queryWizard(ws: Workspace, p: Prompter): Promise<Query | undefined> {
  console.log(ui.bold("\nCriar uma consulta para o agente"));
  console.log("Uma consulta é uma pergunta fixa que o agente pode fazer a um sistema, por exemplo");
  console.log('"ver o status de um pedido pelo número". O agente só escolhe a consulta e informa o valor;');
  console.log("ele nunca escreve SQL. Tudo é somente leitura, e a consulta só vale depois de aprovada.");

  const db = await chooseDatabase(ws, p);
  if (!db) return undefined;
  const structure = ws.loadDbStructure(db.structureFile);
  if (!structure) {
    console.log(ui.yellow("A estrutura desse banco não foi encontrada. Leia o banco de novo."));
    return undefined;
  }

  const title = (await p.ask("\nPara que serve? (ex.: Ver o status de um pedido pelo número) > "))?.trim();
  if (!title) return undefined;
  const when = (await p.ask("Quando o agente deve usar? (Enter = mesma frase) > "))?.trim() || title;

  const mode = (await p.ask(`\nComo montar? ${ui.cyan("1")}. Com o assistente (sem SQL)  ${ui.cyan("2")}. Escrever o SQL > `))?.trim();
  let sql: string;
  let params: QueryParam[];
  let maxRows = 20;
  let origin: Query["origin"] = "assistente";

  if (mode === "2") {
    origin = "manual";
    console.log(ui.dim("Use :nome para parâmetros (ex.: WHERE numero = :numero). Só SELECT, um comando, sem comentários."));
    sql = (await p.ask("SQL > "))?.trim() ?? "";
    if (!sql) return undefined;
    params = [];
    for (const name of placeholders(sql)) {
      const tRaw = (await p.ask(`Tipo de :${name}? ${ui.cyan("1")}. texto ${ui.cyan("2")}. número ${ui.cyan("3")}. data > `))?.trim();
      const desc = (await p.ask(`O que é :${name}? (ex.: número do pedido) > `))?.trim() || name;
      params.push({ name, type: tRaw === "2" ? "numero" : tRaw === "3" ? "data" : "texto", description: desc, required: true });
    }
  } else {
    const table = await chooseTable(structure.tables, p);
    if (!table) return undefined;
    const sensitive = new Set(db.sensitive.filter((s) => s.column.startsWith(`${table.schema}.${table.name}.`)).map((s) => s.column.split(".").pop()));
    console.log(ui.bold(`\nColunas de ${table.schema}.${table.name}`) + ui.dim("  (🔒 = dado sensível: aparece mascarado para o agente)"));
    table.columns.forEach((c, i) => console.log(`  ${ui.cyan(String(i + 1).padStart(2))}. ${c.name} ${ui.dim(c.type)}${sensitive.has(c.name) ? " 🔒" : ""}`));

    const shown = pickMany(await p.ask("\nQuais colunas o agente deve ver? (números, ex.: 1,3,4) > "), table.columns).map((c) => c.name);
    if (!shown.length) return undefined;
    const filterCols = pickMany(await p.ask("Por quais colunas filtrar? São os valores que o agente vai informar. (números; Enter = nenhuma) > "), table.columns);
    const filters: Filter[] = [];
    for (const c of filterCols) {
      const text = paramType(c.type) === "texto";
      const op = text ? (await p.ask(`  ${c.name}: ${ui.cyan("1")}. valor exato  ${ui.cyan("2")}. contém o texto > `))?.trim() : "1";
      filters.push({ column: c.name, op: op === "2" ? "contem" : "igual" });
    }
    if (!filters.length) console.log(ui.yellow("  Sem filtro, a consulta sempre devolve as mesmas linhas (até o limite)."));
    const orderRaw = (await p.ask("Ordenar por qual coluna? (número; Enter = sem ordem) > "))?.trim();
    const orderCol = orderRaw ? table.columns[Number(orderRaw) - 1] : undefined;
    const desc = orderCol ? (await p.ask(`  ${ui.cyan("1")}. do maior para o menor (mais recentes primeiro)  ${ui.cyan("2")}. do menor para o maior > `))?.trim() !== "2" : false;
    const maxRaw = Number((await p.ask("Máximo de linhas por resposta (Enter = 20, até 200) > "))?.trim());
    maxRows = Number.isInteger(maxRaw) && maxRaw > 0 ? Math.min(maxRaw, 200) : 20;
    ({ sql, params } = buildSelect(db.engine, table, shown, filters, orderCol ? { column: orderCol.name, desc } : undefined, maxRows));
  }

  const errors = validateSql(sql, params);
  console.log(ui.bold("\nSQL da consulta:"));
  console.log(`  ${sql}`);
  if (errors.length) {
    console.log(ui.red("\nA consulta foi recusada:"));
    for (const e of errors) console.log(ui.red(`  - ${e}`));
    return undefined;
  }
  let id = slug(title);
  const exists = ws.loadQueries().queries.some((q) => q.id === id);
  if (exists && !(await p.confirm(`Já existe uma consulta "${id}". Substituir? (ela volta para aprovação)`, false))) return undefined;
  if (!(await p.confirm("Salvar esta consulta?"))) return undefined;
  const saved = saveQuery(ws, { id, title, description: when, databaseId: db.id, sql, params, maxRows, origin });
  console.log(ui.green(`\n✓ Consulta salva: consultar_${saved.id} (revisão ${saved.revision}).`));
  console.log(ui.dim("  Ela só fica disponível para o agente depois de aprovada em: Revisar e aprovar."));
  return saved;
}
