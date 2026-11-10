/**
 * Monta saida/servidor-mcp/: o servidor MCP pronto para conectar ao agente.
 *
 *   servidor.js            código (cópia de templates/servidor-mcp/servidor.js)
 *   package.json           dependências (SDK oficial do MCP + zod + drivers dos bancos, se houver consultas)
 *   instalar.bat/.sh       instala as dependências com dois cliques
 *   LEIA-ME.md             como conectar no Claude Desktop, passo a passo
 *   dados/config.json      empresa e ferramentas APROVADAS
 *   dados/empresa.md       perfil aprovado
 *   dados/guardrails.md    regras de segurança (sempre todas: regra nunca é opcional)
 *   dados/skills/*.md      cópias das versões APROVADAS das skills
 *   dados/consultas.json   consultas APROVADAS (sem nenhuma credencial)
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Workspace } from "../core/workspace.js";
import { QuerySchema } from "../core/schema.js";
import { GUARDRAILS_PATH, loadContext, planSkills } from "../skills/index.js";
import { SERVER_REVISION, TOOLS } from "./tools.js";
import { loadKeys } from "./keys.js";

export const SERVER_DIR = "saida/servidor-mcp";
const TEMPLATE = fileURLToPath(new URL("../../templates/servidor-mcp/servidor.js", import.meta.url));

/** Versões das dependências do servidor gerado (fixas e verificadas na criação desta versão do MCP-Builder). */
const DEPENDENCIES = { "@modelcontextprotocol/sdk": "^1.32.2", zod: "^4.1.0" };
const DRIVERS = { postgres: { pg: "8.23.1" }, sqlserver: { mssql: "12.7.11" } } as const;

/** Formato de cada consulta em dados/consultas.json (o que o servidor lê). */
export interface ServerQuery {
  id: string;
  titulo: string;
  descricao: string;
  motor: "postgres" | "sqlserver";
  host: string;
  porta: number;
  banco: string;
  /** Usado nas variáveis de ambiente: MCP_DB_<apelido>_USUARIO / _SENHA. */
  apelido: string;
  sql: string;
  parametros: Array<{ name: string; type: string; description: string; required: boolean }>;
  maxLinhas: number;
  /** Nomes de colunas sensíveis desse banco: o valor aparece como «oculto». */
  mascarar: string[];
}

/** O servidor só existe depois que alguém aprovou ao menos uma ferramenta. */
export function serverEnabled(ws: Workspace): boolean {
  return Object.entries(ws.loadApprovals().items).some(([id, a]) => id.startsWith("ferramenta:") && a.decision === "aprovado");
}

/** Consultas aprovadas (pela cópia aprovada) cujo banco ainda está no inventário. */
export function approvedQueries(ws: Workspace): ServerQuery[] {
  const approvals = ws.loadApprovals().items;
  const dbs = ws.loadInventory().databases;
  const aliases = new Map<string, string>();
  const out: ServerQuery[] = [];
  for (const q of ws.loadQueries().queries) {
    const snap = ws.path(`aprovado/consultas/${q.id}.json`);
    if (approvals[`consulta:${q.id}`]?.decision !== "aprovado" || !existsSync(snap)) continue;
    const aq = QuerySchema.parse(JSON.parse(readFileSync(snap, "utf8")));
    const db = dbs.find((d) => d.id === aq.databaseId);
    if (!db) continue;
    if (!aliases.has(db.id)) {
      let alias = db.database.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
      while ([...aliases.values()].includes(alias)) alias += "_2";
      aliases.set(db.id, alias);
    }
    out.push({
      id: aq.id,
      titulo: aq.title,
      descricao: aq.description,
      motor: db.engine,
      host: db.host,
      porta: db.port,
      banco: db.database,
      apelido: aliases.get(db.id)!,
      sql: aq.sql,
      parametros: aq.params,
      maxLinhas: aq.maxRows,
      mascarar: [...new Set(db.sensitive.map((s) => s.column.split(".").pop()!.toLowerCase()))],
    });
  }
  return out;
}

export function writeServer(ws: Workspace): void {
  const company = ws.loadCompany();
  const approvals = ws.loadApprovals().items;
  const approved = (id: string) => approvals[id]?.decision === "aprovado";
  const out = ws.path(SERVER_DIR);
  const dados = join(out, "dados");
  mkdirSync(join(dados, "skills"), { recursive: true });
  const queries = approvedQueries(ws);

  // Código e instalação (drivers de banco só se houver consultas daquele tipo).
  copyFileSync(TEMPLATE, join(out, "servidor.js"));
  const deps: Record<string, string> = { ...DEPENDENCIES };
  for (const q of queries) Object.assign(deps, DRIVERS[q.motor]);
  writeFileSync(
    join(out, "package.json"),
    JSON.stringify(
      {
        name: `mcp-${company.slug}`,
        version: `1.0.${SERVER_REVISION}`,
        private: true,
        description: `Servidor MCP da ${company.name}, gerado pelo MCP-Builder`,
        type: "module",
        main: "servidor.js",
        scripts: { start: "node servidor.js" },
        engines: { node: ">=20" },
        dependencies: deps,
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(join(out, "instalar.bat"), "@echo off\r\ncd /d \"%~dp0\"\r\necho Instalando o servidor MCP...\r\ncall npm install --no-fund --no-audit --loglevel=error\r\nif errorlevel 1 (echo Falhou. Veja a mensagem acima. & pause & exit /b 1)\r\necho.\r\necho Pronto! Veja o LEIA-ME.md para conectar ao Claude.\r\npause\r\n");
  writeFileSync(join(out, "instalar.sh"), '#!/usr/bin/env sh\ncd "$(dirname "$0")" || exit 1\nnpm install --no-fund --no-audit --loglevel=error && echo "Pronto! Veja o LEIA-ME.md para conectar ao Claude."\n');
  // Modo HTTP (vários colaboradores). As variáveis de banco e HTTPS são definidas antes, no ambiente ou no serviço.
  writeFileSync(join(out, "iniciar-http.bat"), "@echo off\r\ncd /d \"%~dp0\"\r\nnode servidor.js --http\r\npause\r\n");
  writeFileSync(join(out, "iniciar-http.sh"), '#!/usr/bin/env sh\ncd "$(dirname "$0")" || exit 1\nexec node servidor.js --http\n');

  // Chaves de acesso do modo HTTP: só nome e hash.
  const keys = loadKeys(ws).map((k) => ({ nome: k.nome, hash: k.hash }));
  writeFileSync(join(dados, "chaves.json"), JSON.stringify(keys, null, 2) + "\n");

  // Dados aprovados
  const tools = TOOLS.filter((t) => approved(`ferramenta:${t.id}`)).map((t) => t.id);
  writeFileSync(
    join(dados, "config.json"),
    JSON.stringify(
      {
        empresa: company.name,
        servidor: `mcp-${company.slug}`,
        versao: `1.0.${SERVER_REVISION}`,
        ferramentas: tools,
        auditoria: true,
        // Padrão seguro: só neste computador. Para a rede, veja o LEIA-ME (HTTPS obrigatório).
        http: { host: "127.0.0.1", porta: 3333, limitePorMinuto: 60 },
      },
      null,
      2,
    ) + "\n",
  );
  const snap = ws.path("aprovado/empresa.md");
  writeFileSync(join(dados, "empresa.md"), approved("contexto:empresa") && existsSync(snap) ? readFileSync(snap, "utf8") : "");
  writeFileSync(join(dados, "guardrails.md"), existsSync(ws.path(GUARDRAILS_PATH)) ? readFileSync(ws.path(GUARDRAILS_PATH), "utf8") : "");
  writeFileSync(join(dados, "consultas.json"), JSON.stringify(queries, null, 2) + "\n");

  // Skills: só as aprovadas E que ainda se aplicam à empresa.
  rmSync(join(dados, "skills"), { recursive: true, force: true });
  mkdirSync(join(dados, "skills"), { recursive: true });
  const served: string[] = [];
  for (const p of planSkills(loadContext(ws))) {
    const s = ws.path(`aprovado/skills/${p.name}.md`);
    if (approved(`skill:${p.name}`) && existsSync(s)) {
      copyFileSync(s, join(dados, "skills", `${p.name}.md`));
      served.push(p.name);
    }
  }

  writeFileSync(join(out, "LEIA-ME.md"), readme(company.name, company.slug, out, tools, served, queries) + readmeHttp(keys.map((k) => k.nome), queries));
}

function readmeHttp(keys: string[], queries: ServerQuery[]): string {
  const aliases = [...new Set(queries.map((q) => q.apelido))];
  return `
## Modo HTTP: vários colaboradores ao mesmo tempo

O modo acima (Claude Desktop) atende **uma pessoa, no próprio computador**. Para o agente atender vários
colaboradores (Teams, intranet, um assistente central), o servidor roda no modo HTTP, num computador ou servidor
da empresa que fica ligado.

### 1. Crie uma chave de acesso para cada pessoa ou aplicação

No MCP-Builder: **Revisar e aprovar → Acesso pela rede → Criar chave**. A chave aparece **uma única vez**:
copie e entregue a quem vai usar. O servidor guarda só um "resumo" (hash) dela, que não serve para acessar.

Chaves atuais: ${keys.length ? keys.join(", ") : "**nenhuma** (sem chave, o modo HTTP não inicia)"}

### 2. Inicie

- **Windows:** dois cliques em \`iniciar-http.bat\`
- **Linux:** \`./iniciar-http.sh\`

Por padrão, ele atende **só neste computador**, em \`http://127.0.0.1:3333/mcp\`.${aliases.length ? ` Antes de iniciar, defina as variáveis dos bancos (${aliases.map((a) => `\`MCP_DB_${a}_USUARIO\`/\`_SENHA\``).join(", ")}) no ambiente do computador ou do serviço.` : ""}

Os clientes enviam a chave no cabeçalho \`Authorization: Bearer <chave>\`. Sem chave válida, a resposta é 401.

### 3. Para abrir na rede (com cuidado)

| Variável | Para quê |
|---|---|
| \`MCP_HTTP_HOST=0.0.0.0\` | Aceitar conexões de outros computadores |
| \`MCP_HTTP_PORTA=3333\` | Porta |
| \`MCP_HTTPS_CERT\` e \`MCP_HTTPS_CHAVE\` | Caminho do certificado e da chave privada (PEM): **HTTPS obrigatório na rede** |
| \`MCP_HTTP_SEM_TLS=1\` | Só se houver um proxy HTTPS na frente (IIS, nginx) fazendo a criptografia |
| \`MCP_HTTP_NOMES=mcp.empresa.local\` | Nomes pelos quais o servidor é chamado (proteção contra DNS rebinding) |
| \`MCP_HTTP_LIMITE=60\` | Requisições por minuto por chave |

Sem HTTPS (e sem declarar o proxy), o servidor **se recusa a abrir na rede**: a chave trafegaria sem criptografia.

Peça ao TI para liberar a porta **só** para os computadores que precisam (firewall) e para rodar o servidor como
serviço (ex.: NSSM no Windows, systemd no Linux), para ele voltar sozinho depois de um reinício.

### Auditoria por pessoa

No modo HTTP, cada linha de \`logs/auditoria-AAAA-MM.jsonl\` registra **quem** chamou (o nome da chave).
Para tirar o acesso de alguém, revogue a chave no MCP-Builder e reinicie o servidor.

### Verificar se está no ar

\`http://127.0.0.1:3333/saude\` responde \`{"ok":true}\` (não exige chave e não expõe nenhuma informação).
`;
}

function readme(name: string, slug: string, dir: string, tools: string[], skills: string[], queries: ServerQuery[]): string {
  const serverPath = join(dir, "servidor.js");
  const aliases = [...new Map(queries.map((q) => [q.apelido, q])).values()];
  const env = Object.fromEntries(aliases.flatMap((q) => [[`MCP_DB_${q.apelido}_USUARIO`, "usuario_de_leitura"], [`MCP_DB_${q.apelido}_SENHA`, "senha_do_usuario"]]));
  const entry: Record<string, unknown> = { command: "node", args: [serverPath] };
  if (aliases.length) entry.env = env;
  const config = JSON.stringify({ mcpServers: { [`mcp-${slug}`]: entry } }, null, 2);
  return `# Servidor MCP: ${name}

Este servidor conecta um assistente de IA (como o Claude) ao conhecimento e às consultas **aprovados** da ${name}.
Ele foi gerado pelo MCP-Builder: **não edite os arquivos à mão**. Para mudar algo, use o MCP-Builder
(revisar e aprovar), e esta pasta será atualizada.

## O que está no ar

- **Ferramentas aprovadas:** ${tools.length ? tools.join(", ") : "nenhuma"}
- **Skills aprovadas:** ${skills.length ? skills.join(", ") : "nenhuma"}
- **Consultas aos sistemas aprovadas:** ${queries.length ? queries.map((q) => `consultar_${q.id}`).join(", ") : "nenhuma"}
- **Regras de segurança:** todas, sempre

Tudo é **somente leitura**. CPF, CNPJ, números de cartão, senhas e as colunas sensíveis dos bancos são mascarados
nas respostas, e toda consulta fica registrada em \`logs/\`.

## 1. Instalar (uma vez)

Precisa do Node.js (o mesmo usado pelo MCP-Builder).

- **Windows:** dois cliques em \`instalar.bat\`
- **Linux/Mac:** \`./instalar.sh\`
${
  aliases.length
    ? `
## 2. Credenciais dos bancos (para as consultas)

As consultas precisam de um usuário de banco. **A senha nunca fica nos arquivos desta pasta**: ela é informada
nas variáveis de ambiente da configuração do Claude (passo 3).

Peça ao TI um usuário **só para o agente**, com permissão de leitura (SELECT) **apenas** nas tabelas usadas
pelas consultas. Assim, mesmo que alguém tente algo diferente, o banco recusa.

| Banco | Servidor | Variáveis |
|---|---|---|
${aliases.map((q) => `| ${q.banco} | ${q.host}:${q.porta} | \`MCP_DB_${q.apelido}_USUARIO\`, \`MCP_DB_${q.apelido}_SENHA\` |`).join("\n")}

Tabelas usadas pelas consultas (para o TI dar a permissão):

${queries.map((q) => `- **consultar_${q.id}** (${q.banco}): \`${q.sql.match(/\bfrom\s+([^\s,]+)/i)?.[1] ?? "veja o SQL em dados/consultas.json"}\``).join("\n")}
`
    : ""
}
## ${aliases.length ? "3" : "2"}. Conectar ao Claude Desktop

1. Abra o Claude Desktop → **Configurações** → **Desenvolvedor** → **Editar configuração**.
   (O arquivo é o \`claude_desktop_config.json\`.)
2. Cole o trecho abaixo. Se o arquivo já tiver \`"mcpServers"\`, acrescente só a entrada \`"mcp-${slug}"\` dentro dele.${aliases.length ? "\n   Troque `usuario_de_leitura` e `senha_do_usuario` pelos dados reais." : ""}

\`\`\`json
${config}
\`\`\`

3. Feche e abra o Claude Desktop. O servidor **mcp-${slug}** aparece na lista de conectores.

Outros clientes compatíveis com MCP usam o mesmo comando: \`node "${serverPath}"\`${aliases.length ? ", com as mesmas variáveis de ambiente" : ""}.

## ${aliases.length ? "4" : "3"}. Testar

Pergunte ao Claude algo que esteja nas skills, por exemplo: *"Como abro um chamado?"*. Ele deve usar a
ferramenta **buscar_conhecimento** e responder com base no conteúdo aprovado.${queries.length ? `\nPara as consultas, peça algo como: *"${queries[0].titulo}"*.` : ""}

## Auditoria

Cada consulta gera uma linha em \`logs/auditoria-AAAA-MM.jsonl\`: quando, qual ferramenta, os argumentos
(já mascarados) e se deu certo. Guarde esses arquivos conforme a política da empresa.

## Quando algo mudar na empresa

Rode o MCP-Builder de novo, atualize a análise e revise o que mudou. Esta pasta é refeita automaticamente, e
o Claude passa a usar as novas versões aprovadas depois de ser reiniciado.
`;
}
