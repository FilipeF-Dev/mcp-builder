/**
 * Fluxo completo, sem rede nem banco: entrevista → skills → atualização incremental →
 * aprovação por versão → servidor MCP. É o caminho que a empresa percorre de verdade.
 */
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { prepararEmpresa } from "./helpers.js";

type WS = Awaited<ReturnType<typeof prepararEmpresa>>;
let ws: WS;
let refreshArtifacts: typeof import("../src/generation.js").refreshArtifacts;
let skills: typeof import("../src/skills/index.js");
let approvals: typeof import("../src/delivery/approvals.js");
let progress: typeof import("../src/company/progress.js");
let wizard: typeof import("../src/queries/wizard.js");

/** Responde a pendência de uma skill (como a pessoa faria no menu). */
function responder(topic: string, answer: string) {
  const qs = ws.loadQuestions();
  const q = qs.find((x) => x.topic === topic);
  assert.ok(q, `pendência ${topic} não existe`);
  q.status = "respondida";
  q.answer = answer;
  ws.saveQuestions(qs);
}

before(async () => {
  ws = await prepararEmpresa("fluxo");
  refreshArtifacts = (await import("../src/generation.js")).refreshArtifacts;
  skills = await import("../src/skills/index.js");
  approvals = await import("../src/delivery/approvals.js");
  progress = await import("../src/company/progress.js");
  wizard = await import("../src/queries/wizard.js");
});

describe("fluxo da empresa", () => {
  it("entrevista completa libera as skills", () => {
    assert.equal(progress.completedUpTo(ws.loadCompany()), 6);
    assert.ok(skills.skillsEnabled(ws));
  });

  it("gera skills fixas e adaptadas ao ambiente", () => {
    ws.addQuestions(skills.skillQuestions(skills.loadContext(ws)));
    refreshArtifacts(ws);
    const names = readdirSync(ws.path("saida/skills"));
    for (const n of ["conduta-do-assistente", "lgpd-dados-pessoais", "seguranca-senhas-e-acessos", "encaminhar-para-humano"]) assert.ok(names.includes(n), `faltou fixa ${n}`);
    for (const n of ["sistema-teknisa", "migracao-de-sistemas", "email", "abrir-chamado", "duvidas-frequentes"]) assert.ok(names.includes(n), `faltou adaptada ${n}`);
  });

  it("skill nunca inventa: o que falta aparece como 'A definir'", () => {
    const md = readFileSync(ws.path("saida/skills/sistema-teknisa/SKILL.md"), "utf8");
    assert.match(md, /^---\nname: sistema-teknisa\ndescription: /);
    assert.match(md, /A definir/);
  });

  it("LGPD usa as colunas sensíveis encontradas nos bancos", () => {
    const md = readFileSync(ws.path("saida/skills/lgpd-dados-pessoais/SKILL.md"), "utf8");
    assert.match(md, /Onde há dados pessoais nos sistemas/);
    assert.match(readFileSync(ws.path("saida/guardrails.md"), "utf8"), /CPF/);
  });

  it("rodar de novo sem mudanças não refaz nada", () => {
    assert.deepEqual(refreshArtifacts(ws).regenerated, []);
  });

  it("responder uma pendência refaz só a skill afetada", () => {
    responder("skill:email:acesso", "Pelo webmail em https://webmail.exemplo.com.br");
    const r = refreshArtifacts(ws);
    assert.ok(r.regenerated.includes("saida/skills/email/SKILL.md"));
    assert.ok(!r.regenerated.includes("saida/skills/sistema-teknisa/SKILL.md"));
    assert.ok(!r.regenerated.includes("saida/skills/conduta-do-assistente/SKILL.md"));
    assert.match(readFileSync(ws.path("saida/skills/email/SKILL.md"), "utf8"), /webmail\.exemplo/);
  });

  it("aprovar tudo monta o servidor só com o aprovado", () => {
    for (const item of approvals.reviewItems(ws)) approvals.decide(ws, item, item.id === "skill:migracao-de-sistemas" ? "recusado" : "aprovado");
    refreshArtifacts(ws);
    const dados = ws.path("saida/servidor-mcp/dados");
    assert.ok(existsSync(join(dados, "config.json")));
    const served = readdirSync(join(dados, "skills"));
    assert.ok(served.includes("sistema-teknisa.md"));
    assert.ok(!served.includes("migracao-de-sistemas.md"), "skill recusada não pode ir para o servidor");
    assert.equal(approvals.reviewSummary(approvals.reviewItems(ws)).waiting, 0);
  });

  it("skill alterada depois da aprovação: o servidor continua com a versão aprovada", () => {
    responder("skill:sistema-teknisa:acesso", "Atalho na área de trabalho");
    refreshArtifacts(ws);
    const item = approvals.reviewItems(ws).find((i) => i.id === "skill:sistema-teknisa")!;
    assert.equal(item.status, "mudou");
    const servida = () => readFileSync(ws.path("saida/servidor-mcp/dados/skills/sistema-teknisa.md"), "utf8");
    assert.ok(!servida().includes("Atalho na área de trabalho"), "não podia ter ido para o ar sem aprovação");
    approvals.decide(ws, item, "aprovado");
    refreshArtifacts(ws);
    assert.ok(servida().includes("Atalho na área de trabalho"));
  });

  it("consulta só vai para o servidor depois de aprovada, e sem credenciais", () => {
    wizard.saveQuery(ws, {
      id: "status_pedido",
      title: "Ver o status de um pedido",
      description: "Ver o status de um pedido pelo número",
      databaseId: "postgres-db-5432-erp",
      sql: 'SELECT "id", "status" FROM "public"."pedidos" WHERE "id" = :id LIMIT 20',
      params: [{ name: "id", type: "numero", description: "número do pedido", required: true }],
      maxRows: 20,
      origin: "manual",
    });
    refreshArtifacts(ws);
    const lerConsultas = () => JSON.parse(readFileSync(ws.path("saida/servidor-mcp/dados/consultas.json"), "utf8"));
    assert.equal(lerConsultas().length, 0);
    const item = approvals.reviewItems(ws).find((i) => i.id === "consulta:status_pedido")!;
    approvals.decide(ws, item, "aprovado");
    refreshArtifacts(ws);
    const [c] = lerConsultas();
    assert.equal(c.apelido, "ERP");
    assert.deepEqual(c.mascarar, ["cpf"]);
    assert.ok(!/senha|password/i.test(JSON.stringify(c)));
    assert.ok(JSON.parse(readFileSync(ws.path("saida/servidor-mcp/package.json"), "utf8")).dependencies.pg, "driver do PostgreSQL deveria ser incluído");
  });
});
