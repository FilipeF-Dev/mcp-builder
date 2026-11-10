/**
 * Monta saida/servidor-mcp/: o servidor MCP pronto para conectar ao agente.
 *
 *   servidor.js          código (cópia de templates/servidor-mcp/servidor.js)
 *   package.json         dependências (SDK oficial do MCP + zod)
 *   instalar.bat/.sh     instala as dependências com dois cliques
 *   LEIA-ME.md           como conectar no Claude Desktop, passo a passo
 *   dados/config.json    empresa e ferramentas APROVADAS
 *   dados/empresa.md     perfil aprovado
 *   dados/guardrails.md  regras de segurança (sempre todas: regra nunca é opcional)
 *   dados/skills/*.md    cópias das versões APROVADAS das skills
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Workspace } from "../core/workspace.js";
import { GUARDRAILS_PATH, loadContext, planSkills } from "../skills/index.js";
import { SERVER_REVISION, TOOLS } from "./tools.js";

export const SERVER_DIR = "saida/servidor-mcp";
const TEMPLATE = fileURLToPath(new URL("../../templates/servidor-mcp/servidor.js", import.meta.url));

/** Versões das dependências do servidor gerado (verificadas na criação desta versão do MCP-Builder). */
const DEPENDENCIES = { "@modelcontextprotocol/sdk": "^1.32.2", zod: "^4.1.0" };

/** O servidor só existe depois que alguém aprovou ao menos uma ferramenta. */
export function serverEnabled(ws: Workspace): boolean {
  return Object.entries(ws.loadApprovals().items).some(([id, a]) => id.startsWith("ferramenta:") && a.decision === "aprovado");
}

export function writeServer(ws: Workspace): void {
  const company = ws.loadCompany();
  const approvals = ws.loadApprovals().items;
  const approved = (id: string) => approvals[id]?.decision === "aprovado";
  const out = ws.path(SERVER_DIR);
  const dados = join(out, "dados");
  mkdirSync(join(dados, "skills"), { recursive: true });

  // Código e instalação
  copyFileSync(TEMPLATE, join(out, "servidor.js"));
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
        dependencies: DEPENDENCIES,
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(join(out, "instalar.bat"), "@echo off\r\ncd /d \"%~dp0\"\r\necho Instalando o servidor MCP...\r\ncall npm install --no-fund --no-audit --loglevel=error\r\nif errorlevel 1 (echo Falhou. Veja a mensagem acima. & pause & exit /b 1)\r\necho.\r\necho Pronto! Veja o LEIA-ME.md para conectar ao Claude.\r\npause\r\n");
  writeFileSync(join(out, "instalar.sh"), '#!/usr/bin/env sh\ncd "$(dirname "$0")" || exit 1\nnpm install --no-fund --no-audit --loglevel=error && echo "Pronto! Veja o LEIA-ME.md para conectar ao Claude."\n');

  // Dados aprovados
  const tools = TOOLS.filter((t) => approved(`ferramenta:${t.id}`)).map((t) => t.id);
  writeFileSync(
    join(dados, "config.json"),
    JSON.stringify({ empresa: company.name, servidor: `mcp-${company.slug}`, versao: `1.0.${SERVER_REVISION}`, ferramentas: tools, auditoria: true }, null, 2) + "\n",
  );
  const snap = ws.path("aprovado/empresa.md");
  writeFileSync(join(dados, "empresa.md"), approved("contexto:empresa") && existsSync(snap) ? readFileSync(snap, "utf8") : "");
  writeFileSync(join(dados, "guardrails.md"), existsSync(ws.path(GUARDRAILS_PATH)) ? readFileSync(ws.path(GUARDRAILS_PATH), "utf8") : "");

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

  writeFileSync(join(out, "LEIA-ME.md"), readme(company.name, company.slug, out, tools, served));
}

function readme(name: string, slug: string, dir: string, tools: string[], skills: string[]): string {
  const serverPath = join(dir, "servidor.js");
  const config = JSON.stringify({ mcpServers: { [`mcp-${slug}`]: { command: "node", args: [serverPath] } } }, null, 2);
  return `# Servidor MCP: ${name}

Este servidor conecta um assistente de IA (como o Claude) ao conhecimento **aprovado** da ${name}.
Ele foi gerado pelo MCP-Builder: **não edite os arquivos à mão**. Para mudar algo, use o MCP-Builder
(revisar e aprovar), e esta pasta será atualizada.

## O que está no ar

- **Ferramentas aprovadas:** ${tools.length ? tools.join(", ") : "nenhuma"}
- **Skills aprovadas:** ${skills.length ? skills.join(", ") : "nenhuma"}
- **Regras de segurança:** todas, sempre

Tudo é **somente leitura**. CPF, CNPJ, números de cartão e senhas são mascarados nas respostas, e toda
consulta fica registrada em \`logs/\`.

## 1. Instalar (uma vez)

Precisa do Node.js (o mesmo usado pelo MCP-Builder).

- **Windows:** dois cliques em \`instalar.bat\`
- **Linux/Mac:** \`./instalar.sh\`

## 2. Conectar ao Claude Desktop

1. Abra o Claude Desktop → **Configurações** → **Desenvolvedor** → **Editar configuração**.
   (O arquivo é o \`claude_desktop_config.json\`.)
2. Cole o trecho abaixo. Se o arquivo já tiver \`"mcpServers"\`, acrescente só a entrada \`"mcp-${slug}"\` dentro dele.

\`\`\`json
${config}
\`\`\`

3. Feche e abra o Claude Desktop. O servidor **mcp-${slug}** aparece na lista de conectores.

Outros clientes compatíveis com MCP usam o mesmo comando: \`node "${serverPath}"\`.

## 3. Testar

Pergunte ao Claude algo que esteja nas skills, por exemplo: *"Como abro um chamado?"*. Ele deve usar a
ferramenta **buscar_conhecimento** e responder com base no conteúdo aprovado.

## Auditoria

Cada consulta gera uma linha em \`logs/auditoria-AAAA-MM.jsonl\`: quando, qual ferramenta, os argumentos
(já mascarados) e se deu certo. Guarde esses arquivos conforme a política da empresa.

## Quando algo mudar na empresa

Rode o MCP-Builder de novo, atualize a análise e revise o que mudou. Esta pasta é refeita automaticamente, e
o Claude passa a usar as novas versões aprovadas depois de ser reiniciado.
`;
}
