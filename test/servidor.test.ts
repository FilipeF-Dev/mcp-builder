/**
 * O servidor MCP GERADO, executado de verdade e acessado por um cliente MCP oficial:
 * modo stdio (Claude Desktop) e modo HTTP (vários colaboradores), com as proteções.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { prepararEmpresa } from "./helpers.js";

let serverDir: string;
let ws: Awaited<ReturnType<typeof prepararEmpresa>>;
let createKey: typeof import("../src/delivery/keys.js").createKey;
let refreshArtifacts: typeof import("../src/generation.js").refreshArtifacts;

const texto = (r: unknown) => ((r as { content: Array<{ text: string }> }).content[0].text);
const auditoria = () =>
  readdirSync(join(serverDir, "logs"))
    .flatMap((f) => readFileSync(join(serverDir, "logs", f), "utf8").trim().split("\n"))
    .map((l) => JSON.parse(l));

before(async () => {
  ws = await prepararEmpresa("servidor");
  refreshArtifacts = (await import("../src/generation.js")).refreshArtifacts;
  createKey = (await import("../src/delivery/keys.js")).createKey;
  const skills = await import("../src/skills/index.js");
  const approvals = await import("../src/delivery/approvals.js");
  ws.addQuestions(skills.skillQuestions(skills.loadContext(ws)));
  (await import("../src/queries/wizard.js")).saveQuery(ws, {
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
  for (const item of approvals.reviewItems(ws)) approvals.decide(ws, item, "aprovado");
  refreshArtifacts(ws);
  serverDir = ws.path("saida/servidor-mcp");
});

describe("servidor gerado: modo stdio", () => {
  let client: Client;
  before(async () => {
    client = new Client({ name: "teste", version: "1.0.0" });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(serverDir, "servidor.js")], stderr: "ignore" }));
  });
  after(async () => client?.close());

  it("expõe só ferramentas somente leitura", async () => {
    const tools = (await client.listTools()).tools;
    assert.ok(tools.some((t) => t.name === "buscar_conhecimento"));
    assert.ok(tools.every((t) => t.annotations?.readOnlyHint === true), "toda ferramenta deve ser somente leitura");
  });

  it("busca responde com o conteúdo aprovado", async () => {
    const r = await client.callTool({ name: "buscar_conhecimento", arguments: { pergunta: "como abrir um chamado" } });
    assert.match(texto(r), /chamado/i);
  });

  it("mascara CPF e senha nas respostas e na auditoria", async () => {
    const r = await client.callTool({ name: "preparar_chamado", arguments: { resumo: "Erro no sistema", detalhes: "CPF 123.456.789-09 senha: abc123" } });
    assert.ok(!texto(r).includes("123.456.789-09") && !texto(r).includes("abc123"));
    assert.match(texto(r), /Parece que uma senha foi enviada/);
    const linha = auditoria().at(-1);
    assert.equal(linha.quem, "local (stdio)");
    assert.ok(!JSON.stringify(linha).includes("abc123"));
  });

  it("consulta aprovada vira ferramenta com parâmetro tipado", async () => {
    const t = (await client.listTools()).tools.find((x) => x.name === "consultar_status_pedido");
    assert.ok(t, "consulta aprovada deveria virar ferramenta");
    assert.equal((t.inputSchema.properties as Record<string, { type: string }>).id.type, "number");
  });

  it("consulta sem credenciais explica o que falta, sem quebrar", async () => {
    const r = (await client.callTool({ name: "consultar_status_pedido", arguments: { id: 1 } })) as { isError?: boolean };
    assert.equal(r.isError, true);
    assert.match(texto(r), /credenciais do banco não configuradas \(MCP_DB_ERP_USUARIO/);
  });

  it("texto em parâmetro numérico é recusado antes de chegar ao banco", async () => {
    const r = (await client.callTool({ name: "consultar_status_pedido", arguments: { id: "1; DROP TABLE pedidos" } }).catch((e: Error) => ({ isError: true, erro: e.message }))) as { isError?: boolean };
    assert.equal(r.isError, true);
  });
});

describe("servidor gerado: modo HTTP", () => {
  const porta = 30000 + Math.floor(Math.random() * 20000);
  const url = `http://127.0.0.1:${porta}`;
  let proc: ChildProcess | undefined;
  let chave: string;

  const iniciar = (env: Record<string, string> = {}) =>
    spawnSync(process.execPath, [join(serverDir, "servidor.js"), "--http"], { env: { ...process.env, MCP_HTTP_PORTA: String(porta), ...env }, timeout: 8000, encoding: "utf8" });

  it("sem nenhuma chave, recusa iniciar", () => {
    const r = iniciar();
    assert.equal(r.status, 1);
    assert.match(r.stderr, /nenhuma chave/);
  });

  it("aberto na rede sem HTTPS, recusa iniciar", () => {
    chave = createKey(ws, "teams");
    refreshArtifacts(ws);
    const r = iniciar({ MCP_HTTP_HOST: "0.0.0.0" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /HTTPS/);
  });

  it("a chave nunca é gravada, só o hash", () => {
    assert.ok(!readFileSync(join(serverDir, "dados", "chaves.json"), "utf8").includes(chave));
  });

  describe("no ar", () => {
    before(async () => {
      proc = spawn(process.execPath, [join(serverDir, "servidor.js"), "--http"], { env: { ...process.env, MCP_HTTP_PORTA: String(porta), MCP_HTTP_LIMITE: "8" }, stdio: "ignore" });
      for (let i = 0; i < 50; i++) {
        try {
          if ((await fetch(`${url}/saude`)).ok) return;
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error("servidor HTTP não subiu");
    });
    after(() => proc?.kill());

    const post = (headers: Record<string, string>) =>
      fetch(`${url}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });

    it("sem chave ou com chave errada: 401", async () => {
      assert.equal((await post({})).status, 401);
      assert.equal((await post({ Authorization: "Bearer mcp_falsa" })).status, 401);
    });

    it("Host falso (DNS rebinding): 403", async () => {
      // fetch não permite trocar o Host; usamos http.request.
      const { request } = await import("node:http");
      const status = await new Promise<number>((resolve, reject) => {
        const req = request(`${url}/mcp`, { method: "POST", headers: { Host: "atacante.com", Authorization: `Bearer ${chave}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" } }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        });
        req.on("error", reject);
        req.end(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
      });
      assert.equal(status, 403);
    });

    it("cliente MCP com chave funciona, e a auditoria registra quem", async () => {
      const client = new Client({ name: "teste-http", version: "1.0.0" });
      await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${chave}` } } }));
      const r = await client.callTool({ name: "regras_de_seguranca", arguments: {} });
      assert.match(texto(r), /Nunca/);
      await client.close();
      assert.ok(auditoria().some((l) => l.quem === "teams" && l.ferramenta === "regras_de_seguranca"));
    });

    it("limite por chave: 429 depois do limite", async () => {
      const codes: number[] = [];
      for (let i = 0; i < 10; i++) codes.push((await post({ Authorization: `Bearer ${chave}` })).status);
      assert.ok(codes.includes(429), `esperava 429 em ${codes.join(",")}`);
    });
  });
});
