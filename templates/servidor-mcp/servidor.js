#!/usr/bin/env node
/**
 * Servidor MCP gerado pelo MCP-Builder.
 *
 * Conecta um assistente de IA (ex.: Claude) ao conhecimento e às consultas APROVADOS da empresa.
 * Tudo é somente leitura.
 *
 * Dois modos:
 *   node servidor.js          → stdio: um usuário, no próprio computador (Claude Desktop)
 *   node servidor.js --http   → HTTP: vários colaboradores, com chave de acesso por pessoa/aplicação
 *
 * Proteções aplicadas aqui no servidor (não só no texto das skills):
 *   - só ferramentas, skills e consultas aprovadas pelo TI ficam disponíveis;
 *   - CPF, CNPJ, cartão, senhas e colunas sensíveis dos bancos são mascarados em toda resposta;
 *   - toda chamada fica registrada em logs/auditoria-AAAA-MM.jsonl (no modo HTTP, com quem chamou);
 *   - no modo HTTP: chave obrigatória (só o hash fica salvo), só localhost por padrão, HTTPS para rede,
 *     proteção contra DNS rebinding, limite de requisições por chave e de tamanho de corpo.
 *
 * Não edite este arquivo: ele é refeito pelo MCP-Builder.
 */
import { readFileSync, readdirSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { createHash, timingSafeEqual } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const HERE = dirname(fileURLToPath(import.meta.url));
const DADOS = join(HERE, "dados");
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const log = (...a) => console.error("[mcp]", ...a); // stderr: no modo stdio, stdout é do protocolo

// ───────────────────────── Dados aprovados ─────────────────────────

const config = JSON.parse(read(join(DADOS, "config.json")) || "{}");
const empresa = read(join(DADOS, "empresa.md"));
const regras = read(join(DADOS, "guardrails.md"));
const nomeEmpresa = config.empresa ?? "a empresa";
const ativa = (id) => (config.ferramentas ?? []).includes(id);

/** Skills aprovadas: { nome, descricao, texto, secoes: [{titulo, texto}] } */
const skills = existsSync(join(DADOS, "skills"))
  ? readdirSync(join(DADOS, "skills"))
      .filter((f) => f.endsWith(".md"))
      .map((f) => {
        const texto = read(join(DADOS, "skills", f));
        const front = texto.match(/^---\n([\s\S]*?)\n---/);
        const campo = (k) => front?.[1].match(new RegExp(`^${k}:\\s*(.*)$`, "m"))?.[1]?.trim() ?? "";
        let descricao = campo("description");
        try {
          if (descricao.startsWith('"')) descricao = JSON.parse(descricao);
        } catch {}
        const corpo = texto.replace(/^---\n[\s\S]*?\n---\n/, "");
        const secoes = corpo
          .split(/^## /m)
          .slice(1)
          .map((s) => ({ titulo: s.split("\n")[0].trim(), texto: s.slice(s.indexOf("\n") + 1).trim() }));
        return { nome: campo("name") || f.replace(/\.md$/, ""), descricao, texto, secoes };
      })
  : [];

// ───────────────────────── Proteções ─────────────────────────

const MASCARA = "«oculto»";
const PADROES = [
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, MASCARA], // CPF
  [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, MASCARA], // CNPJ
  [/\b(?:\d[ -]?){13,19}\b/g, MASCARA], // cartão
  [/\b(senha|password|pwd|token|secret)(\s*[=:]\s*)\S+/gi, `$1$2${MASCARA}`],
];

function mascarar(texto) {
  let out = String(texto);
  for (const [re, rep] of PADROES) out = out.replace(re, rep);
  return out;
}

/** Mascara cada texto dentro de um objeto (sem quebrar a estrutura). */
function mascararObjeto(v) {
  if (typeof v === "string") return mascarar(v);
  if (Array.isArray(v)) return v.map(mascararObjeto);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mascararObjeto(x)]));
  return v;
}

/** Quem está chamando (no modo HTTP, o nome da chave de acesso). */
const contexto = new AsyncLocalStorage();

function auditar(ferramenta, argumentos, ok, tamanho) {
  if (config.auditoria === false) return;
  try {
    const dir = join(HERE, "logs");
    mkdirSync(dir, { recursive: true });
    const mes = new Date().toISOString().slice(0, 7);
    const quem = contexto.getStore()?.quem ?? "local (stdio)";
    const linha = { quando: new Date().toISOString(), quem, ferramenta, argumentos: mascararObjeto(argumentos ?? {}), ok, tamanho };
    appendFileSync(join(dir, `auditoria-${mes}.jsonl`), JSON.stringify(linha) + "\n");
  } catch {
    /* auditoria nunca derruba o servidor */
  }
}

const parecaSenha = (args) => /\b(senha|password|pwd)\s*[=:]/i.test(JSON.stringify(args ?? {}));

/** Envolve cada ferramenta: mascaramento, aviso de senha e auditoria. */
function protegida(nome, fn) {
  return async (args) => {
    try {
      let texto = await fn(args ?? {});
      if (parecaSenha(args)) {
        texto = "⚠ Parece que uma senha foi enviada. Oriente a pessoa a trocá-la imediatamente e nunca compartilhar senhas.\n\n" + texto;
      }
      texto = mascarar(texto);
      auditar(nome, args, true, texto.length);
      return { content: [{ type: "text", text: texto }] };
    } catch (e) {
      auditar(nome, args, false, 0);
      return { content: [{ type: "text", text: `Erro ao executar ${nome}: ${e?.message ?? e}` }], isError: true };
    }
  };
}

// ───────────────────────── Busca simples ─────────────────────────

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const PARADAS = new Set("a o as os de da do das dos e em no na nos nas um uma para por com como que se meu minha onde qual quais".split(" "));
const termos = (s) => norm(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !PARADAS.has(t));

function buscar(pergunta, limite = 3) {
  const q = termos(pergunta);
  if (!q.length) return [];
  const trechos = [
    // As regras ficam fora da busca: têm ferramenta própria e poluiriam os resultados.
    ...skills.flatMap((s) => s.secoes.filter((sec) => !/^Regras que nunca/i.test(sec.titulo)).map((sec) => ({ fonte: `skill ${s.nome}`, titulo: sec.titulo, texto: sec.texto, extra: `${s.nome} ${s.descricao}` }))),
    ...empresa.split(/^## /m).slice(1).map((s) => ({ fonte: "perfil da empresa", titulo: s.split("\n")[0], texto: s.slice(s.indexOf("\n") + 1).trim(), extra: "" })),
  ];
  return trechos
    .map((t) => {
      const alvo = termos(`${t.titulo} ${t.titulo} ${t.texto} ${t.extra}`);
      const pontos = q.reduce((n, termo) => n + alvo.filter((a) => a.startsWith(termo) || termo.startsWith(a)).length, 0);
      return { ...t, pontos };
    })
    .filter((t) => t.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, limite);
}

// ───────────────────────── Consultas aos sistemas ─────────────────────────
//
// Cada consulta APROVADA vira uma ferramenta consultar_<id>. O agente nunca escreve SQL.
// Proteções: validação do SQL (de novo, aqui), parâmetros separados do texto, transação somente
// leitura (PostgreSQL), tempo máximo, limite de linhas, colunas sensíveis mascaradas.
// Credenciais: variáveis de ambiente MCP_DB_<APELIDO>_USUARIO e MCP_DB_<APELIDO>_SENHA.

const TEMPO_MAXIMO_MS = 15000;
const PROIBIDAS = new Set(
  ("insert update delete merge upsert replace drop alter create truncate rename grant revoke deny exec execute call do into copy " +
    "vacuum analyze reindex cluster lock set reset begin commit rollback savepoint declare open fetch dbcc bulk openrowset " +
    "opendatasource openquery shutdown kill backup restore waitfor pg_sleep pg_read_file pg_read_binary_file pg_ls_dir lo_import " +
    "lo_export dblink load_file outfile listen notify refresh security pg_terminate_backend").split(" "),
);
const foraDeTextos = (sql, fn) => sql.split(/('(?:[^']|'')*')/).map((p, i) => (i % 2 ? p : fn(p))).join("");

function sqlSeguro(sql) {
  const texto = sql.trim().replace(/;\s*$/, "");
  const codigo = foraDeTextos(texto, (p) => p).replace(/'(?:[^']|'')*'/g, "''");
  if (/--|\/\*/.test(codigo) || codigo.includes(";") || !/^\s*(select|with)\b/i.test(codigo) || /\b(xp|sp)_\w+/i.test(codigo)) return false;
  return !(codigo.toLowerCase().match(/[a-z_][a-z0-9_]*/g) ?? []).some((w) => PROIBIDAS.has(w));
}

/** Validadas uma vez, na inicialização. */
const consultas = JSON.parse(read(join(DADOS, "consultas.json")) || "[]").filter((c) => {
  if (sqlSeguro(c.sql)) return true;
  log(`consulta "${c.id}" ignorada: SQL não passou na validação de somente leitura.`);
  return false;
});

/** Troca :nome pelo marcador do driver, fora de textos. Devolve o SQL e a ordem dos parâmetros. */
function prepararSql(sql, motor) {
  const ordem = [];
  const pronto = foraDeTextos(sql.trim().replace(/;\s*$/, ""), (p) =>
    p.replace(/(?<![:\w]):([a-z_][a-z0-9_]*)/gi, (_, nome) => {
      ordem.push(nome.toLowerCase());
      return motor === "postgres" ? `$${ordem.length}` : `@${nome.toLowerCase()}`;
    }),
  );
  return { pronto, ordem };
}

function credenciais(c) {
  const usuario = process.env[`MCP_DB_${c.apelido}_USUARIO`];
  const senha = process.env[`MCP_DB_${c.apelido}_SENHA`];
  if (!usuario || !senha) throw new Error(`credenciais do banco não configuradas (MCP_DB_${c.apelido}_USUARIO / _SENHA). Veja o LEIA-ME.`);
  return { usuario, senha };
}

const poolsSqlServer = new Map();

async function executar(c, args) {
  const { pronto, ordem } = prepararSql(c.sql, c.motor);
  const valores = ordem.map((n) => args[n] ?? null);
  const { usuario, senha } = credenciais(c);
  if (c.motor === "postgres") {
    const { default: pg } = await import("pg");
    const cliente = new pg.Client({ host: c.host, port: c.porta, database: c.banco, user: usuario, password: senha, application_name: "MCP (somente leitura)", connectionTimeoutMillis: 10000 });
    await cliente.connect();
    try {
      await cliente.query("BEGIN READ ONLY");
      await cliente.query(`SET LOCAL statement_timeout = ${TEMPO_MAXIMO_MS}`);
      const r = await cliente.query(pronto, valores);
      return r.rows;
    } finally {
      await cliente.query("ROLLBACK").catch(() => {});
      await cliente.end().catch(() => {});
    }
  }
  const { default: mssql } = await import("mssql");
  let pool = poolsSqlServer.get(c.apelido);
  if (!pool) {
    pool = new mssql.ConnectionPool({
      server: c.host, port: c.porta, database: c.banco, user: usuario, password: senha,
      connectionTimeout: 10000, requestTimeout: TEMPO_MAXIMO_MS, pool: { max: 4 },
      options: { encrypt: true, trustServerCertificate: true, readOnlyIntent: true, appName: "MCP (somente leitura)" },
    });
    await pool.connect();
    poolsSqlServer.set(c.apelido, pool);
  }
  const req = pool.request();
  ordem.forEach((n, i) => req.input(n, valores[i]));
  return (await req.query(pronto)).recordset;
}

function tabelaMarkdown(linhas, mascarar_colunas) {
  const colunas = Object.keys(linhas[0]);
  const celula = (col, v) => {
    if (mascarar_colunas.includes(col.toLowerCase())) return MASCARA;
    if (v === null || v === undefined) return "";
    const s = v instanceof Date ? v.toISOString().slice(0, 19).replace("T", " ") : String(v);
    return s.replace(/\|/g, "\\|").replace(/\s+/g, " ").slice(0, 200);
  };
  return [
    `| ${colunas.join(" | ")} |`,
    `| ${colunas.map(() => "---").join(" | ")} |`,
    ...linhas.map((l) => `| ${colunas.map((col) => celula(col, l[col])).join(" | ")} |`),
  ].join("\n");
}

const tipoZod = (p) => {
  const base = p.type === "numero" ? z.number() : p.type === "data" ? z.string().regex(/^\d{4}-\d{2}-\d{2}/, "use AAAA-MM-DD") : z.string().min(1).max(200);
  const descrito = base.describe(p.description);
  return p.required ? descrito : descrito.optional();
};

// ───────────────────────── Servidor MCP ─────────────────────────

const SO_LEITURA = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

/** Cria um servidor com tudo o que foi aprovado. No modo HTTP, um por requisição (sem estado compartilhado). */
function criarServidor() {
  const server = new McpServer(
    { name: config.servidor ?? "mcp-empresa", version: config.versao ?? "1.0.0" },
    {
      instructions: [
        `Você é o assistente interno da ${nomeEmpresa}. Ajude os colaboradores com dúvidas e pequenos suportes do dia a dia.`,
        "Antes de responder, procure a informação com buscar_conhecimento ou leia a skill adequada (listar_skills / ler_skill).",
        "Para dados dos sistemas (pedidos, estoque...), use as ferramentas consultar_* disponíveis (lista em listar_consultas).",
        "Siga SEMPRE as regras de segurança (ferramenta regras_de_seguranca). Se a informação não estiver nas skills, diga que não sabe e oriente a falar com uma pessoa.",
        "Trechos marcados com \"⚠ A definir\" ainda não foram informados pela empresa: não invente o conteúdo.",
      ].join("\n"),
    },
  );

  if (ativa("buscar_conhecimento")) {
    server.registerTool(
      "buscar_conhecimento",
      {
        title: "Buscar no conhecimento da empresa",
        description: `Procura nas skills e no perfil da ${nomeEmpresa} os trechos mais relevantes para uma pergunta de um colaborador.`,
        inputSchema: { pergunta: z.string().min(2).describe("A dúvida do colaborador, em linguagem natural") },
        annotations: SO_LEITURA,
      },
      protegida("buscar_conhecimento", ({ pergunta }) => {
        const achados = buscar(pergunta);
        if (!achados.length) return "Nada encontrado no conhecimento aprovado. Se não souber responder, oriente a pessoa a falar com o suporte (skill encaminhar-para-humano).";
        return achados.map((a) => `### ${a.titulo}\n_Fonte: ${a.fonte}_\n\n${a.texto}`).join("\n\n---\n\n");
      }),
    );
  }

  if (ativa("listar_skills")) {
    server.registerTool(
      "listar_skills",
      { title: "Listar skills", description: "Lista as skills aprovadas, com quando usar cada uma.", annotations: SO_LEITURA },
      protegida("listar_skills", () => (skills.length ? skills.map((s) => `- **${s.nome}**: ${s.descricao}`).join("\n") : "Nenhuma skill aprovada ainda.")),
    );
  }

  if (ativa("ler_skill")) {
    server.registerTool(
      "ler_skill",
      {
        title: "Ler uma skill",
        description: "Devolve o conteúdo completo de uma skill aprovada.",
        inputSchema: { nome: z.string().describe("Nome da skill, como aparece em listar_skills") },
        annotations: SO_LEITURA,
      },
      protegida("ler_skill", ({ nome }) => {
        const s = skills.find((x) => x.nome === nome);
        return s ? s.texto : `Skill "${nome}" não encontrada. Disponíveis: ${skills.map((x) => x.nome).join(", ") || "nenhuma"}.`;
      }),
    );
  }

  if (ativa("regras_de_seguranca")) {
    server.registerTool(
      "regras_de_seguranca",
      { title: "Regras de segurança", description: "Regras que o assistente nunca pode quebrar. Consulte em caso de dúvida.", annotations: SO_LEITURA },
      protegida("regras_de_seguranca", () => regras || "Nenhuma regra registrada."),
    );
  }

  if (ativa("preparar_chamado")) {
    server.registerTool(
      "preparar_chamado",
      {
        title: "Preparar um chamado",
        description: "Organiza as informações de um problema num texto pronto para o colaborador abrir o chamado. NÃO abre o chamado: apenas prepara o texto e diz onde abrir.",
        inputSchema: {
          resumo: z.string().min(3).describe("Resumo do problema em uma frase"),
          detalhes: z.string().optional().describe("O que aconteceu, desde quando, mensagem de erro, quem é afetado"),
          urgente: z.boolean().optional().describe("Se impede o trabalho ou afeta a operação"),
        },
        annotations: SO_LEITURA,
      },
      protegida("preparar_chamado", ({ resumo, detalhes, urgente }) => {
        const onde = skills.find((s) => s.nome === "abrir-chamado")?.secoes.find((x) => /onde/i.test(x.titulo))?.texto;
        return [
          "**Texto para o chamado**",
          "",
          `Assunto: ${urgente ? "[URGENTE] " : ""}${resumo}`,
          "",
          detalhes ? `Descrição: ${detalhes}` : "Descrição: (peça à pessoa: o que aconteceu, desde quando, mensagem de erro e quem é afetado)",
          "",
          "**Onde abrir**",
          onde ?? "Consulte a skill encaminhar-para-humano.",
        ].join("\n");
      }),
    );
  }

  for (const c of consultas) {
    server.registerTool(
      `consultar_${c.id}`,
      {
        title: c.titulo,
        description: `${c.descricao} (consulta somente leitura no sistema da empresa; até ${c.maxLinhas} linhas)`,
        inputSchema: Object.fromEntries(c.parametros.map((p) => [p.name, tipoZod(p)])),
        annotations: SO_LEITURA,
      },
      protegida(`consultar_${c.id}`, async (args) => {
        const linhas = (await executar(c, args)).slice(0, c.maxLinhas);
        if (!linhas.length) return "Nenhum resultado para esses valores.";
        const aviso = linhas.length >= c.maxLinhas ? `\n\n_Mostrando as primeiras ${c.maxLinhas} linhas._` : "";
        return `${linhas.length} resultado(s):\n\n${tabelaMarkdown(linhas, c.mascarar)}${aviso}`;
      }),
    );
  }

  if (consultas.length && ativa("listar_skills")) {
    server.registerTool(
      "listar_consultas",
      { title: "Listar consultas", description: "Lista as consultas aos sistemas da empresa que o agente pode usar.", annotations: SO_LEITURA },
      protegida("listar_consultas", () => consultas.map((c) => `- **consultar_${c.id}**: ${c.descricao}. Parâmetros: ${c.parametros.map((p) => `${p.name} (${p.description})`).join(", ") || "nenhum"}`).join("\n")),
    );
  }

  // Recursos: para clientes que preferem ler documentos em vez de chamar ferramentas.
  server.registerResource("perfil-da-empresa", "empresa://perfil", { title: `Perfil da ${nomeEmpresa}`, mimeType: "text/markdown" }, async (uri) => ({
    contents: [{ uri: uri.href, text: mascarar(empresa) }],
  }));
  server.registerResource("regras-de-seguranca", "empresa://regras", { title: "Regras de segurança", mimeType: "text/markdown" }, async (uri) => ({
    contents: [{ uri: uri.href, text: regras }],
  }));
  for (const s of skills) {
    server.registerResource(`skill-${s.nome}`, `skill://${s.nome}`, { title: s.nome, description: s.descricao, mimeType: "text/markdown" }, async (uri) => ({
      contents: [{ uri: uri.href, text: mascarar(s.texto) }],
    }));
  }

  // Prompt pronto: identidade + regras, para clientes que suportam prompts.
  server.registerPrompt(
    "assistente",
    { title: `Assistente da ${nomeEmpresa}`, description: "Instruções iniciais do assistente: conduta e regras de segurança." },
    () => ({
      messages: [
        {
          role: "user",
          content: { type: "text", text: [skills.find((s) => s.nome === "conduta-do-assistente")?.texto ?? "", regras].filter(Boolean).join("\n\n") },
        },
      ],
    }),
  );
  return server;
}

// ───────────────────────── Modo HTTP ─────────────────────────

/** Chaves de acesso: só o HASH (SHA-256) fica salvo. A chave em si é mostrada uma única vez, ao ser criada. */
const chaves = JSON.parse(read(join(DADOS, "chaves.json")) || "[]");
const hash = (t) => createHash("sha256").update(t).digest();

function identificar(req) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? "");
  if (!m) return undefined;
  const h = hash(m[1]);
  // Comparação em tempo constante: não revela por tempo de resposta quanto da chave está certo.
  return chaves.find((c) => /^[0-9a-f]{64}$/.test(c.hash ?? "") && timingSafeEqual(Buffer.from(c.hash, "hex"), h))?.nome;
}

const LIMITE_POR_MINUTO = Number(process.env.MCP_HTTP_LIMITE ?? config.http?.limitePorMinuto ?? 60);
const janelas = new Map();
function dentroDoLimite(quem) {
  const agora = Date.now();
  const j = janelas.get(quem) ?? { inicio: agora, n: 0 };
  if (agora - j.inicio > 60_000) Object.assign(j, { inicio: agora, n: 0 });
  j.n++;
  janelas.set(quem, j);
  return j.n <= LIMITE_POR_MINUTO;
}

const LIMITE_CORPO = 1024 * 1024; // 1 MB
function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let tamanho = 0;
    const partes = [];
    req.on("data", (d) => {
      tamanho += d.length;
      if (tamanho > LIMITE_CORPO) {
        reject(Object.assign(new Error("corpo grande demais"), { status: 413 }));
        req.destroy();
      } else partes.push(d);
    });
    req.on("end", () => {
      try {
        resolve(partes.length ? JSON.parse(Buffer.concat(partes).toString("utf8")) : undefined);
      } catch {
        reject(Object.assign(new Error("JSON inválido"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function responder(res, status, corpo, extra = {}) {
  if (res.headersSent) return;
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...extra });
  res.end(JSON.stringify(corpo));
}

async function iniciarHttp() {
  const host = process.env.MCP_HTTP_HOST ?? config.http?.host ?? "127.0.0.1";
  const porta = Number(process.env.MCP_HTTP_PORTA ?? config.http?.porta ?? 3333);
  const cert = process.env.MCP_HTTPS_CERT;
  const chave = process.env.MCP_HTTPS_CHAVE;
  const local = ["127.0.0.1", "localhost", "::1"].includes(host);

  if (!chaves.length) {
    log("Modo HTTP recusado: nenhuma chave de acesso criada. Crie uma no MCP-Builder (Revisar e aprovar → Acesso pela rede).");
    process.exit(1);
  }
  if (!local && !(cert && chave) && process.env.MCP_HTTP_SEM_TLS !== "1") {
    log(`Modo HTTP recusado: para aceitar conexões da rede (${host}), use HTTPS (MCP_HTTPS_CERT e MCP_HTTPS_CHAVE).`);
    log("Se houver um proxy HTTPS na frente (IIS, nginx), defina MCP_HTTP_SEM_TLS=1. Veja o LEIA-ME.");
    process.exit(1);
  }

  // Nomes pelos quais o servidor pode ser chamado (proteção contra DNS rebinding).
  const nomes = (process.env.MCP_HTTP_NOMES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const allowedHosts = [...new Set([`${host}:${porta}`, `localhost:${porta}`, `127.0.0.1:${porta}`, ...nomes.flatMap((n) => (n.includes(":") ? [n] : [n, `${n}:${porta}`]))])];

  const tratar = async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/saude") return responder(res, 200, { ok: true });
    if (url.pathname !== "/mcp") return responder(res, 404, { erro: "não encontrado" });
    if (req.method !== "POST") return responder(res, 405, { erro: "use POST" }, { Allow: "POST" });

    const quem = identificar(req);
    if (!quem) return responder(res, 401, { erro: "chave de acesso ausente ou inválida" }, { "WWW-Authenticate": 'Bearer realm="mcp"' });
    if (!dentroDoLimite(quem)) return responder(res, 429, { erro: "muitas requisições; tente em instantes" }, { "Retry-After": "60" });

    let corpo;
    try {
      corpo = await lerCorpo(req);
    } catch (e) {
      return responder(res, e.status ?? 400, { erro: e.message });
    }

    // Sem estado: um servidor e um transporte por requisição, isolando cada colaborador.
    const server = criarServidor();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, allowedHosts, enableDnsRebindingProtection: true });
    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    try {
      await server.connect(transport);
      await contexto.run({ quem }, () => transport.handleRequest(req, res, corpo));
    } catch (e) {
      log("erro na requisição:", e?.message ?? e);
      responder(res, 500, { erro: "erro interno" });
    }
  };

  const http = cert && chave ? createHttpsServer({ cert: readFileSync(cert), key: readFileSync(chave) }, tratar) : createHttpServer(tratar);
  http.requestTimeout = 60_000;
  http.listen(porta, host, () => {
    log(`Servidor MCP da ${nomeEmpresa} no ar: ${cert ? "https" : "http"}://${host}:${porta}/mcp`);
    log(`${chaves.length} chave(s) de acesso · limite ${LIMITE_POR_MINUTO} requisições/minuto por chave · ${local ? "só neste computador" : "aberto na rede"}`);
  });
}

// ───────────────────────── Início ─────────────────────────

if (process.argv.includes("--http") || process.env.MCP_TRANSPORTE === "http") {
  await iniciarHttp();
} else {
  await criarServidor().connect(new StdioServerTransport());
}
