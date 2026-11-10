/**
 * Descoberta: faixas de rede, reconhecimento de sistemas, fatos e comparação, bancos, entrevista.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { expandAll, expandRange, MAX_ADDRESSES } from "../src/collectors/network/ranges.js";
import { classify, matchNetwork } from "../src/collectors/network/index.js";
import { matchSignatures } from "../src/signatures/match.js";
import { diffFacts, fingerprint, hostFacts } from "../src/core/facts.js";
import { compareHosts } from "../src/core/changes.js";
import { businessAreas, matchDatabase, sensitiveColumns } from "../src/collectors/database/interpret.js";
import { parseAnswer } from "../src/company/interview.js";
import { findQuestion } from "../src/company/levels.js";
import type { DbTable, NetService } from "../src/core/schema.js";
import { makeHost } from "./helpers.js";

describe("faixas de rede", () => {
  it("expande /24 sem rede e broadcast", () => {
    const ips = expandRange("192.168.1.0/24");
    assert.equal(ips.length, 254);
    assert.equal(ips[0], "192.168.1.1");
    assert.equal(ips.at(-1), "192.168.1.254");
  });
  it("aceita intervalo e IP único", () => {
    assert.deepEqual(expandRange("10.0.0.10-12"), ["10.0.0.10", "10.0.0.11", "10.0.0.12"]);
    assert.deepEqual(expandRange("10.0.0.5"), ["10.0.0.5"]);
  });
  it("recusa faixas grandes demais e entradas inválidas", () => {
    assert.throws(() => expandRange("10.0.0.0/16"));
    assert.throws(() => expandAll(["10.0.0.0/20", "10.1.0.0/20"]), new RegExp(String(MAX_ADDRESSES)));
    assert.throws(() => expandRange("300.1.1.1"));
    assert.throws(() => expandRange("rede-da-empresa"));
  });
});

describe("reconhecimento de sistemas", () => {
  it("reconhece o Teknisa por programa instalado", () => {
    const m = matchSignatures(makeHost({ software: [{ name: "Teknisa Sistemas Integrados" }] }));
    assert.ok(m.some((s) => s.signatureId === "teknisa"));
  });
  it("não confunde touchpad com o sistema Touch", () => {
    const m = matchSignatures(makeHost({ software: [{ name: "Synaptics TouchPad Driver" }, { name: "Touch Screen Calibration" }] }));
    assert.ok(!m.some((s) => s.signatureId === "touch"));
  });
  it("dá certeza alta com programa + serviço", () => {
    const m = matchSignatures(
      makeHost({ software: [{ name: "PostgreSQL 18" }], services: [{ name: "postgresql-x64-18", displayName: "PostgreSQL Server", state: "Running" }] }),
    );
    assert.equal(m.find((s) => s.signatureId === "postgres")?.confidence, "alta");
  });
  it("na rede, reconhece pelo banner e ignora porta compartilhada sem banner", () => {
    const smtpExchange: NetService[] = [{ port: 25, name: "SMTP", category: "email", banner: "220 mail Microsoft ESMTP MAIL Service ready" }];
    assert.ok(matchNetwork(smtpExchange).some((s) => s.signatureId === "exchange"));
    const smtpMudo: NetService[] = [{ port: 25, name: "SMTP", category: "email" }];
    assert.equal(matchNetwork(smtpMudo).length, 0, "porta 25 sozinha não identifica qual servidor de e-mail");
  });
  it("classifica equipamentos pelas portas", () => {
    const s = (port: number, category = "infraestrutura"): NetService => ({ port, name: String(port), category });
    assert.match(classify([s(88), s(389), s(445)]), /controlador de domínio/);
    assert.equal(classify([s(9100, "impressao")]), "impressora");
    assert.equal(classify([s(1433, "banco-de-dados")]), "servidor de banco de dados");
  });
});

describe("fatos e comparação entre análises", () => {
  it("atualização de versão é 'alterado', não 'removido + adicionado'", () => {
    const a = hostFacts(makeHost({ software: [{ name: "7-Zip 24.00 (x64)", version: "24.00" }] }));
    const b = hostFacts(makeHost({ software: [{ name: "7-Zip 26.00 (x64)", version: "26.00" }] }));
    const d = diffFacts(a, b);
    assert.equal(d.length, 1);
    assert.equal(d[0].kind, "alterado");
  });
  it("serviços com sufixo aleatório do Windows não geram mudança falsa", () => {
    const a = hostFacts(makeHost({ services: [{ name: "CDPUserSvc_3f2a1", displayName: "Connected Devices" }] }));
    const b = hostFacts(makeHost({ services: [{ name: "CDPUserSvc_9bc04", displayName: "Connected Devices" }] }));
    assert.equal(diffFacts(a, b).length, 0);
  });
  it("impressão digital muda só quando os fatos do prefixo mudam", () => {
    const f = { "empresa:sede": "Campinas", "host:x:papel": "servidor" };
    const g = { ...f, "host:x:papel": "estação" };
    assert.equal(fingerprint(f, ["empresa:"]), fingerprint(g, ["empresa:"]));
    assert.notEqual(fingerprint(f, ["host:"]), fingerprint(g, ["host:"]));
  });
  it("sistema que sumiu vira mudança importante com pergunta", () => {
    const prev = makeHost({ systems: [{ signatureId: "exchange", systemName: "Microsoft Exchange Server", category: "email", confidence: "alta", evidence: [] }] });
    const next = makeHost({ collectedAt: "2026-02-01T00:00:00.000Z" });
    const { changes, questions } = compareHosts(prev, next);
    assert.equal(changes[0].importance, "alta");
    assert.equal(questions.length, 1);
  });
});

describe("bancos de dados (só estrutura)", () => {
  const tables: DbTable[] = [
    { schema: "public", name: "clientes", kind: "tabela", primaryKey: ["id"], columns: ["id", "nome", "cpf", "email", "telefone"].map((name) => ({ name, type: "text", nullable: true })) },
    { schema: "public", name: "funcionarios", kind: "tabela", primaryKey: ["id"], columns: ["id", "salario", "dt_nascimento", "nr_pis"].map((name) => ({ name, type: "text", nullable: true })) },
    { schema: "public", name: "nfe_emitidas", kind: "tabela", primaryKey: ["id"], columns: [{ name: "chave", type: "text", nullable: true }] },
    { schema: "public", name: "usuarios", kind: "tabela", primaryKey: ["id"], columns: [{ name: "senha", type: "text", nullable: true }] },
  ];
  it("encontra colunas sensíveis (LGPD)", () => {
    const kinds = new Set(sensitiveColumns({ tables }).map((s) => s.kind));
    for (const k of ["CPF", "e-mail", "telefone", "salário e remuneração", "data de nascimento", "PIS/NIS", "senha"]) assert.ok(kinds.has(k), `faltou ${k}`);
  });
  it("não marca colunas comuns como sensíveis", () => {
    assert.equal(sensitiveColumns({ tables: [tables[2]] }).length, 0);
  });
  it("sugere áreas de negócio pelos nomes das tabelas", () => {
    const areas = businessAreas({ tables });
    assert.ok(areas.includes("clientes") && areas.includes("fiscal") && areas.includes("RH e folha"));
  });
  it("reconhece o sistema pelo nome do banco", () => {
    assert.ok(matchDatabase("teknisa_prod", { tables }).some((s) => s.signatureId === "teknisa"));
    assert.equal(matchDatabase("financeiro", { tables }).length, 0);
  });
});

describe("entrevista", () => {
  const q = (id: string) => findQuestion(id)!;
  it("escolha por número e por texto", () => {
    assert.equal(parseAnswer(q("colaboradores"), "3"), "201 a 500");
    assert.equal(parseAnswer(q("tom"), "formal"), "Formal");
  });
  it("múltipla escolha sem repetição", () => {
    assert.deepEqual(parseAnswer(q("canais"), "1,1,3"), ["Lojas / restaurantes próprios", "Delivery / apps (iFood etc.)"]);
  });
  it("lista separada por ponto e vírgula", () => {
    assert.deepEqual(parseAnswer(q("areas"), "RH; TI ;"), ["RH", "TI"]);
  });
  it("número com separador brasileiro", () => {
    assert.equal(parseAnswer(q("unidades_qtd"), "1.200"), 1200);
  });
  it("opção inexistente sem 'Outro' é erro; com 'Outro' vira texto livre", () => {
    assert.ok(typeof parseAnswer(q("tom"), "9") === "object" && !Array.isArray(parseAnswer(q("tom"), "9")));
    assert.equal(parseAnswer(q("ramo"), "Hotelaria"), "Outro: Hotelaria");
  });
});
