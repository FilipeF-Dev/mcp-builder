/**
 * Proteções básicas: mascaramento de segredos e validação de SQL somente leitura.
 * Se um destes testes falhar, algo que protege a empresa deixou de funcionar.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { redact, redactDeep, MASK } from "../src/core/redact.js";
import { buildSelect, placeholders, validateSql } from "../src/queries/sql.js";
import type { DbTable, QueryParam } from "../src/core/schema.js";

describe("mascaramento de segredos (coleta)", () => {
  const casos: Array<[string, string]> = [
    ["Server=srv;User Id=sa;Password=S3nh@;", "S3nh@"],
    ["sqlcmd -S srv -U sa -P minhasenha", "minhasenha"],
    ["backup.exe /p:Segredo123 /u:admin", "Segredo123"],
    ["mysqldump -u root -pSegredo123 erp", "Segredo123"],
    ["https://joao:abc123@api.empresa.com/x", "abc123"],
    ['curl -H "Authorization: Bearer abcdefghijklmnop"', "abcdefghijklmnop"],
    ["senha=minha token=xyz", "minha"],
    ["chave sk-abcdefghijklmnopqrstuv", "sk-abcdefghijklmnopqrstuv"],
  ];
  for (const [texto, segredo] of casos) {
    it(`oculta o segredo em: ${texto.slice(0, 40)}`, () => {
      const out = redact(texto);
      assert.ok(!out.includes(segredo), `vazou: ${out}`);
      assert.ok(out.includes(MASK));
    });
  }

  it("não altera texto sem segredos", () => {
    assert.equal(redact('"C:\\Program Files\\App\\svc.exe" -k netsvcs'), '"C:\\Program Files\\App\\svc.exe" -k netsvcs');
  });

  it("mascara dentro de objetos sem quebrar a estrutura", () => {
    const out = redactDeep({ a: ["Password=x1;"], b: { c: "pwd=y2" }, n: 3 });
    assert.equal(out.n, 3);
    assert.ok(!JSON.stringify(out).includes("x1") && !JSON.stringify(out).includes("y2"));
  });
});

describe("validação de SQL somente leitura (consultas)", () => {
  const P = (...names: string[]): QueryParam[] => names.map((name) => ({ name, type: "texto", description: "", required: true }));

  it("aceita SELECT com parâmetro declarado", () => {
    assert.deepEqual(validateSql("SELECT id, total FROM pedidos WHERE id = :id", P("id")), []);
  });
  it("aceita conversões do PostgreSQL e horários entre aspas", () => {
    assert.deepEqual(validateSql("SELECT * FROM t WHERE x::text = :x AND h = '10:30'", P("x")), []);
  });
  it("aceita palavras proibidas DENTRO de textos", () => {
    assert.deepEqual(validateSql("SELECT 'drop table' AS texto FROM t", []), []);
  });

  const recusadas = [
    "SELECT 1; DROP TABLE clientes",
    "UPDATE pedidos SET total = 0",
    "DELETE FROM pedidos",
    "SELECT * INTO copia FROM clientes",
    "SELECT * FROM t -- comentário",
    "SELECT * FROM t /* comentário */",
    "SELECT pg_sleep(100)",
    "EXEC xp_cmdshell 'dir'",
    "SELECT * FROM t; ",
  ];
  for (const sql of recusadas.slice(0, -1)) {
    it(`recusa: ${sql}`, () => assert.ok(validateSql(sql, []).length > 0));
  }
  it("aceita um ; final solto", () => assert.deepEqual(validateSql("SELECT * FROM t;", []), []));

  it("exige que todo parâmetro usado seja declarado (e vice-versa)", () => {
    assert.ok(validateSql("SELECT * FROM t WHERE a = :a", []).length > 0);
    assert.ok(validateSql("SELECT * FROM t", P("sobrando")).length > 0);
  });

  it("encontra parâmetros ignorando :: e textos", () => {
    assert.deepEqual(placeholders("SELECT * FROM t WHERE a = :a AND b::int = :b AND c = ':nao'").sort(), ["a", "b"]);
  });
});

describe("gerador de SQL do assistente", () => {
  const tabela: DbTable = {
    schema: "public",
    name: "pedidos",
    kind: "tabela",
    columns: [
      { name: "id", type: "integer", nullable: false },
      { name: "status", type: "text", nullable: true },
    ],
    primaryKey: ["id"],
  };

  it("gera SQL de PostgreSQL válido, com LIMIT e parâmetros", () => {
    const { sql, params } = buildSelect("postgres", tabela, ["id", "status"], [{ column: "status", op: "contem" }], { column: "id", desc: true }, 20);
    assert.equal(sql, `SELECT "id", "status" FROM "public"."pedidos" WHERE "status"::text ILIKE '%' || :status || '%' ORDER BY "id" DESC LIMIT 20`);
    assert.deepEqual(validateSql(sql, params), []);
  });

  it("gera SQL de SQL Server válido, com TOP", () => {
    const { sql, params } = buildSelect("sqlserver", tabela, ["id"], [{ column: "id", op: "igual" }], undefined, 5);
    assert.equal(sql, "SELECT TOP (5) [id] FROM [public].[pedidos] WHERE [id] = :id");
    assert.equal(params[0].type, "numero");
    assert.deepEqual(validateSql(sql, params), []);
  });

  it("escapa nomes com aspas para não permitir injeção pelo nome da coluna", () => {
    const t: DbTable = { ...tabela, columns: [{ name: 'a"b', type: "text", nullable: true }] };
    assert.match(buildSelect("postgres", t, ['a"b'], [], undefined, 1).sql, /"a""b"/);
  });
});
