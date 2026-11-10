/**
 * Leitores de ESTRUTURA de bancos de dados.
 *
 * Regras:
 *   - só consultas FIXAS de metadados (catálogo do sistema / INFORMATION_SCHEMA), listadas abaixo;
 *   - nenhuma consulta lê linhas das tabelas de dados (a contagem de linhas vem das estatísticas do banco);
 *   - sessão em modo somente leitura quando o banco permite;
 *   - a senha só existe em memória, durante a leitura.
 */
import pg from "pg";
import mssql from "mssql";
import type { DbStructure, DbTable } from "../../core/schema.js";

export type Engine = "sqlserver" | "postgres";

export interface DbTarget {
  engine: Engine;
  host: string;
  port: number;
  user: string;
  password: string;
}

export interface ReadResult {
  serverVersion?: string;
  structure: Omit<DbStructure, "id">;
}

export interface DbReader {
  listDatabases(t: DbTarget): Promise<string[]>;
  read(t: DbTarget, database: string): Promise<ReadResult>;
}

export const DEFAULT_PORT: Record<Engine, number> = { sqlserver: 1433, postgres: 5432 };
export const ENGINE_LABEL: Record<Engine, string> = { sqlserver: "SQL Server", postgres: "PostgreSQL" };
const APP = "MCP-Builder (somente leitura)";

// Monta a lista de tabelas a partir de linhas genéricas (igual para os dois motores).
function assemble(
  objects: Array<{ schema: string; name: string; view: boolean; rows: number | null }>,
  columns: Array<{ schema: string; table: string; name: string; type: string; nullable: boolean }>,
  pks: Array<{ schema: string; table: string; column: string }>,
): DbTable[] {
  const key = (s: string, t: string) => `${s}.${t}`;
  const map = new Map<string, DbTable>();
  for (const o of objects) {
    map.set(key(o.schema, o.name), {
      schema: o.schema,
      name: o.name,
      kind: o.view ? "view" : "tabela",
      approxRows: o.rows == null || o.rows < 0 ? undefined : Number(o.rows),
      columns: [],
      primaryKey: [],
    });
  }
  for (const c of columns) map.get(key(c.schema, c.table))?.columns.push({ name: c.name, type: c.type, nullable: c.nullable });
  for (const p of pks) map.get(key(p.schema, p.table))?.primaryKey.push(p.column);
  return [...map.values()].sort((a, b) => key(a.schema, a.name).localeCompare(key(b.schema, b.name)));
}

// ─────────────────────────── PostgreSQL ───────────────────────────

const PG = {
  version: "SHOW server_version",
  databases: "SELECT datname FROM pg_database WHERE datistemplate = false AND datallowconn AND datname <> 'postgres' ORDER BY 1",
  objects: `SELECT n.nspname AS schema, c.relname AS name, c.relkind IN ('v','m') AS view, c.reltuples::bigint AS rows
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind IN ('r','p','v','m') AND n.nspname NOT IN ('pg_catalog','information_schema')
              AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'`,
  // pg_catalog (e não information_schema): mostra a estrutura mesmo para um usuário SEM acesso aos dados.
  columns: `SELECT n.nspname AS schema, c.relname AS table, a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, NOT a.attnotnull AS nullable
            FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE a.attnum > 0 AND NOT a.attisdropped AND c.relkind IN ('r','p','v','m')
              AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
            ORDER BY n.nspname, c.relname, a.attnum`,
  pks: `SELECT n.nspname AS schema, c.relname AS table, a.attname AS column
        FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN LATERAL unnest(k.conkey) WITH ORDINALITY AS u(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = u.attnum
        WHERE k.contype = 'p' ORDER BY n.nspname, c.relname, u.ord`,
  fks: `SELECT c.conrelid::regclass::text AS "from", c.confrelid::regclass::text AS "to" FROM pg_constraint c WHERE c.contype = 'f'`,
  routines: `SELECT n.nspname || '.' || p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY 1`,
};

async function pgClient(t: DbTarget, database: string): Promise<pg.Client> {
  const base = { host: t.host, port: t.port, user: t.user, password: t.password, database, application_name: APP, connectionTimeoutMillis: 10_000, statement_timeout: 120_000 };
  // Tenta sem TLS; se o servidor exigir, tenta com TLS (aceitando certificado interno).
  for (const ssl of [false, { rejectUnauthorized: false }] as const) {
    const c = new pg.Client({ ...base, ssl });
    try {
      await c.connect();
      await c.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
      return c;
    } catch (e) {
      await c.end().catch(() => {});
      if (ssl || !/ssl|encryption|pg_hba/i.test((e as Error).message)) throw e;
    }
  }
  throw new Error("Não foi possível conectar.");
}

const postgres: DbReader = {
  async listDatabases(t) {
    const c = await pgClient(t, "postgres");
    try {
      return (await c.query(PG.databases)).rows.map((r) => r.datname as string);
    } finally {
      await c.end();
    }
  },
  async read(t, database) {
    const c = await pgClient(t, database);
    try {
      const version = (await c.query(PG.version)).rows[0]?.server_version as string | undefined;
      const objects = (await c.query(PG.objects)).rows;
      const columns = (await c.query(PG.columns)).rows;
      const pks = (await c.query(PG.pks)).rows;
      const fks = (await c.query(PG.fks)).rows as Array<{ from: string; to: string }>;
      const routines = (await c.query(PG.routines)).rows.map((r) => r.name as string);
      return { serverVersion: version ? `PostgreSQL ${version}` : undefined, structure: { tables: assemble(objects, columns, pks), foreignKeys: fks, routines } };
    } finally {
      await c.end();
    }
  },
};

// ─────────────────────────── SQL Server ───────────────────────────

const MS = {
  version: "SELECT CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(50)) + ' ' + CAST(SERVERPROPERTY('Edition') AS nvarchar(100)) AS v",
  databases: "SELECT name FROM sys.databases WHERE database_id > 4 AND state = 0 AND HAS_DBACCESS(name) = 1 ORDER BY name",
  objects: `SELECT s.name AS [schema], o.name, CAST(CASE WHEN o.type = 'V' THEN 1 ELSE 0 END AS bit) AS [view],
              (SELECT SUM(p.rows) FROM sys.partitions p WHERE p.object_id = o.object_id AND p.index_id IN (0,1)) AS [rows]
            FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id
            WHERE o.type IN ('U','V') AND o.is_ms_shipped = 0`,
  columns: `SELECT TABLE_SCHEMA AS [schema], TABLE_NAME AS [table], COLUMN_NAME AS name, DATA_TYPE AS type,
              CAST(CASE WHEN IS_NULLABLE = 'YES' THEN 1 ELSE 0 END AS bit) AS nullable
            FROM INFORMATION_SCHEMA.COLUMNS ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION`,
  pks: `SELECT tc.TABLE_SCHEMA AS [schema], tc.TABLE_NAME AS [table], kcu.COLUMN_NAME AS [column]
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
          ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA AND tc.TABLE_NAME = kcu.TABLE_NAME
        WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' ORDER BY kcu.ORDINAL_POSITION`,
  fks: `SELECT OBJECT_SCHEMA_NAME(f.parent_object_id) + '.' + OBJECT_NAME(f.parent_object_id) AS [from],
               OBJECT_SCHEMA_NAME(f.referenced_object_id) + '.' + OBJECT_NAME(f.referenced_object_id) AS [to]
        FROM sys.foreign_keys f`,
  routines: "SELECT ROUTINE_SCHEMA + '.' + ROUTINE_NAME AS name FROM INFORMATION_SCHEMA.ROUTINES ORDER BY 1",
};

async function msPool(t: DbTarget, database?: string): Promise<mssql.ConnectionPool> {
  const pool = new mssql.ConnectionPool({
    server: t.host,
    port: t.port,
    user: t.user,
    password: t.password,
    database,
    connectionTimeout: 10_000,
    requestTimeout: 120_000,
    pool: { max: 1, min: 0 },
    // readOnlyIntent: pede uma réplica de leitura quando existir. trustServerCertificate: servidores internos costumam usar certificado próprio.
    // connectionIsolationLevel 1 = READ UNCOMMITTED: ler metadados sem bloquear ninguém.
    options: { encrypt: true, trustServerCertificate: true, readOnlyIntent: true, appName: APP, connectionIsolationLevel: 1 } as mssql.config["options"],
  });
  await pool.connect();
  return pool;
}

const sqlserver: DbReader = {
  async listDatabases(t) {
    const p = await msPool(t);
    try {
      return (await p.request().query(MS.databases)).recordset.map((r) => r.name as string);
    } finally {
      await p.close();
    }
  },
  async read(t, database) {
    const p = await msPool(t, database);
    try {
      const q = async (sql: string) => (await p.request().query(sql)).recordset as Array<Record<string, unknown>>;
      const version = (await q(MS.version))[0]?.v as string | undefined;
      const objects = (await q(MS.objects)).map((r) => ({ schema: String(r.schema), name: String(r.name), view: Boolean(r.view), rows: r.rows == null ? null : Number(r.rows) }));
      const columns = (await q(MS.columns)).map((r) => ({ schema: String(r.schema), table: String(r.table), name: String(r.name), type: String(r.type), nullable: Boolean(r.nullable) }));
      const pks = (await q(MS.pks)).map((r) => ({ schema: String(r.schema), table: String(r.table), column: String(r.column) }));
      const fks = (await q(MS.fks)).map((r) => ({ from: String(r.from), to: String(r.to) }));
      const routines = (await q(MS.routines)).map((r) => String(r.name));
      return { serverVersion: version ? `SQL Server ${version}` : undefined, structure: { tables: assemble(objects, columns, pks), foreignKeys: fks, routines } };
    } finally {
      await p.close();
    }
  },
};

export const READERS: Record<Engine, DbReader> = { postgres, sqlserver };

/** Mensagens de erro de conexão em linguagem simples. */
export function friendlyDbError(e: unknown): string {
  const m = (e as Error)?.message ?? String(e);
  if (/password authentication failed|Login failed|autentica/i.test(m)) return "Usuário ou senha recusados pelo banco.";
  if (/ECONNREFUSED/i.test(m)) return "O servidor recusou a conexão: confira o endereço e a porta, e se o banco aceita conexões de rede.";
  if (/ETIMEDOUT|timeout|Failed to connect/i.test(m)) return "O servidor não respondeu a tempo: confira o endereço, a porta e se há firewall no caminho.";
  if (/does not exist|Cannot open database/i.test(m)) return "O banco informado não existe ou o usuário não tem acesso a ele.";
  if (/permission denied|denied/i.test(m)) return "O usuário não tem permissão de leitura da estrutura.";
  return m;
}
