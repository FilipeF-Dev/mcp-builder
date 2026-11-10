#!/usr/bin/env node
/**
 * Servidor MCP gerado pelo MCP-Builder.
 *
 * Conecta um assistente de IA (ex.: Claude) ao conhecimento APROVADO da empresa:
 * perfil, skills e regras de segurança. Tudo é somente leitura.
 *
 * Proteções aplicadas aqui no servidor (não só no texto das skills):
 *   - só ferramentas aprovadas pelo TI ficam disponíveis (dados/config.json);
 *   - só o conteúdo aprovado é servido (dados/skills/*.md são cópias da versão aprovada);
 *   - CPF, CNPJ, números de cartão e senhas são mascarados em toda resposta;
 *   - toda chamada fica registrada em logs/auditoria-AAAA-MM.jsonl.
 *
 * Não edite este arquivo: ele é refeito pelo MCP-Builder. Ajustes vão em dados/config.json.
 */
import { readFileSync, readdirSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const HERE = dirname(fileURLToPath(import.meta.url));
const DADOS = join(HERE, "dados");
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");

// ───────────────────────── Dados aprovados ─────────────────────────

const config = JSON.parse(read(join(DADOS, "config.json")) || "{}");
const empresa = read(join(DADOS, "empresa.md"));
const regras = read(join(DADOS, "guardrails.md"));

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

function auditar(ferramenta, argumentos, ok, tamanho) {
  if (config.auditoria === false) return;
  try {
    const dir = join(HERE, "logs");
    mkdirSync(dir, { recursive: true });
    const mes = new Date().toISOString().slice(0, 7);
    const linha = { quando: new Date().toISOString(), ferramenta, argumentos: mascararObjeto(argumentos ?? {}), ok, tamanho };
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

// ───────────────────────── Servidor ─────────────────────────

const nomeEmpresa = config.empresa ?? "a empresa";
const ativa = (id) => (config.ferramentas ?? []).includes(id);

const server = new McpServer(
  { name: config.servidor ?? "mcp-empresa", version: config.versao ?? "1.0.0" },
  {
    instructions: [
      `Você é o assistente interno da ${nomeEmpresa}. Ajude os colaboradores com dúvidas e pequenos suportes do dia a dia.`,
      "Antes de responder, procure a informação com buscar_conhecimento ou leia a skill adequada (listar_skills / ler_skill).",
      "Siga SEMPRE as regras de segurança (ferramenta regras_de_seguranca). Se a informação não estiver nas skills, diga que não sabe e oriente a falar com uma pessoa.",
      "Trechos marcados com \"⚠ A definir\" ainda não foram informados pela empresa: não invente o conteúdo.",
    ].join("\n"),
  },
);

const SO_LEITURA = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

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

await server.connect(new StdioServerTransport());
