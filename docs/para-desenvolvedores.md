# Para desenvolvedores

Arquitetura, fluxo de dados e como estender o MCP-Builder.

## Stack

- **TypeScript / Node.js ≥ 20**, ESM
- **zod** para os esquemas dos arquivos do workspace
- **commander** para a CLI
- Sem dependências nativas: os coletores usam comandos do sistema (PowerShell/CIM no Windows; `dpkg`/`rpm`, `systemctl`, `ss`, `ip` no Linux)

```bash
npm install
npm run dev              # modo guiado, direto do código-fonte (tsx)
npm run dev -- status    # qualquer comando avançado
npm run build            # compila para dist/
npm run typecheck       # tipos de src/, test/ e scripts/
npm test                # testes automatizados (~5 s)
npm run verificar       # typecheck + testes
npm run docs             # regenera docs/03-a-entrevista.md a partir de levels.ts
```

## Testes

Os testes usam o executor nativo do Node (`node:test`), sem framework extra, e rodam a cada envio no GitHub Actions (Windows e Linux, Node 22 e 24).

| Arquivo | O que garante |
|---|---|
| `test/seguranca.test.ts` | Mascaramento de segredos na coleta; validação de SQL somente leitura (recusa `DROP`, `UPDATE`, `INTO`, comentários, `pg_sleep`, `xp_cmdshell`...); gerador de SQL do assistente |
| `test/descoberta.test.ts` | Faixas de rede e limites; reconhecimento de sistemas (inclusive falsos positivos como "touchpad"); fatos estáveis entre versões; comparação entre análises; colunas sensíveis (LGPD); respostas da entrevista |
| `test/fluxo.test.ts` | O caminho completo: entrevista → skills → só o afetado é refeito → aprovação → servidor só com o aprovado → skill alterada continua na versão aprovada → consulta só entra aprovada e sem credenciais |
| `test/servidor.test.ts` | O servidor **gerado**, executado de verdade com um cliente MCP oficial: stdio (somente leitura, mascaramento, auditoria, consultas tipadas) e HTTP (recusas de inicialização, 401, 403 contra DNS rebinding, 429, auditoria com quem, chave nunca gravada) |

Os testes criam empresas fictícias em `.tmp-testes/` (ignorada pelo Git). Nada toca a rede da empresa nem bancos reais.

**Ao mudar algo que protege a empresa** (mascaramento, validação de SQL, aprovações, chaves), acrescente um teste que falharia sem a mudança.

Não cobertos automaticamente (precisam de ambiente real): leitura e consultas em **SQL Server**; consultas em PostgreSQL (testadas manualmente com um banco temporário); conexão no Claude Desktop.

## Estrutura

```
src/
├── cli.ts                  entrada: sem argumentos → modo guiado; com argumentos → comandos
├── guided.ts               menu em linguagem simples
├── actions.ts              ações compartilhadas entre menu e comandos
├── generation.ts           geradores registrados + regeneração incremental (manifesto)
├── core/
│   ├── schema.ts           esquemas zod: company, inventory, questions, changes, manifest
│   ├── facts.ts            conhecimento achatado em fatos chave → valor; diff e impressão digital
│   ├── changes.ts          compara análises → mudanças classificadas + pendências
│   ├── workspace.ts        leitura e gravação do workspace (escrita atômica)
│   ├── stages.ts           as 5 etapas: fonte única para menu, status e relatório
│   ├── redact.ts           mascaramento de segredos
│   ├── prompt.ts           entrada de linhas (funciona com TTY e com pipe)
│   ├── labels.ts           rótulos em linguagem simples
│   └── ui.ts               cores do terminal
├── company/
│   ├── levels.ts           roteiro da entrevista (6 níveis)
│   ├── progress.ts         status por nível
│   ├── interview.ts        entrevista interativa e importação de respostas
│   └── context.ts          gera context/01-empresa.md
├── collectors/database/
│   ├── readers.ts          leitores SQL Server (mssql) e PostgreSQL (pg): só consultas fixas de catálogo
│   ├── interpret.ts        áreas de negócio, colunas sensíveis (LGPD), sistema provável, maiores tabelas
│   ├── index.ts            leitura, comparação entre leituras e pendências
│   └── context.ts          gera context/12-bancos.md
├── collectors/network/
│   ├── ranges.ts           faixas (CIDR, intervalos), limite de 4096, sub-redes locais
│   ├── ports.ts            catálogo de ~40 portas e como sondar cada uma
│   ├── probe.ts            conexão TCP, banner, GET HTTP(S), DNS reverso, ARP, pool com limite
│   ├── index.ts            as 4 fases da varredura, classificação e assinaturas por banner
│   ├── analyze.ts          mudanças entre varreduras e pendências
│   └── context.ts          gera context/11-rede.md
├── collectors/host/
│   ├── windows.ts          script PowerShell somente leitura
│   ├── linux.ts            coletor Linux
│   ├── index.ts            normaliza, mascara e aplica as assinaturas
│   ├── analyze.ts          cruza host × entrevista → pendências
│   └── context.ts          gera context/10-hosts.md
├── skills/
│   ├── types.ts            contrato dos modelos de skill (SkillTemplate, SkillPlan)
│   ├── context.ts          SkillContext: o que um modelo pode consultar
│   ├── index.ts            planeja, renderiza SKILL.md e guardrails.md, gera pendências
│   └── templates/          fixed.ts (LGPD, senhas, humano, conduta) · adaptive.ts (ERP, migração, e-mail...)
├── queries/
│   ├── sql.ts              validação somente leitura, :parâmetros, gerador de SELECT (pg/mssql)
│   └── wizard.ts           assistente de criação, listar, salvar (revisão) e remover
├── delivery/
│   ├── tools.ts            catálogo de ferramentas do servidor (+ revisões)
│   ├── approvals.ts        itens revisáveis, decisões e cópias aprovadas (aprovado/)
│   ├── keys.ts             chaves de acesso do modo HTTP (só hash SHA-256 é guardado)
│   └── server.ts           monta saida/servidor-mcp a partir do aprovado
├── signatures/
│   ├── catalog.ts          catálogo de sistemas conhecidos
│   └── match.ts            pontuação de evidências → nível de certeza
└── report/
    └── html.ts             relatorio.html (arquivo único, sem dependências externas)
```

## Fluxo de dados

```mermaid
flowchart LR
    I[entrevista] --> C[(company.json)]
    H[coletor de host] -->|redact| N[normalização] --> M[assinaturas] --> V[(inventory.json)]
    C --> A[analyze]
    V --> A
    A --> Q[(questions.json)]
    C & V & Q --> R[relatorio.html]
    C & V & Q --> F[fatos]
    F --> G{impressão digital<br/>mudou?}
    G -->|sim| X[regenera o arquivo<br/>context/*.md]
    G -->|não| K[mantém]
    V -->|análise anterior| D[compareHosts] --> L[(changes.json)]
```

### Atualização incremental

- **Fatos** (`core/facts.ts`): chaves estáveis como `host:srv01:sistema:sqlserver` ou `empresa:erp`. Versões e sufixos aleatórios são removidos das chaves (`stableKey`) para que uma atualização de versão seja "alterado", não "removido + adicionado".
- **Reanálise** (`actions.ts → scanHostAction`): arquiva a análise anterior em `historico/`, calcula `diffFacts` e registra cada diferença em `changes.json` com importância (`alta`/`media`/`baixa`). As de importância alta viram pendência.
- **Respostas corrigidas** (`recordAnswer`): entram no diário como importância alta.
- **Geradores** (`generation.ts`): cada um declara `dependsOn` (prefixos de fatos). `refreshArtifacts` compara a impressão digital desses fatos com a do manifesto e só chama o gerador quando ela muda. Novas saídas (skills, guardrails, servidor MCP) devem ser registradas em `GENERATORS`, e não escritas diretamente.

Regras:

1. **O mascaramento acontece na coleta**, antes de qualquer gravação (`collectors/host/index.ts` chama `redactDeep`). Coletores novos devem fazer o mesmo.
2. **Coletores só leem.** Nenhum comando que altere o sistema.
3. **Na dúvida, gere uma pendência** (`ws.addQuestions`) em vez de supor. As pendências são deduplicadas por tópico e texto.
4. **Etapas técnicas respeitam a camada de negócio:** veja `MIN_LEVEL_FOR_TECH_SCAN` em `levels.ts`.
5. **Tudo o que for gerado passa por `generation.ts`**, com dependências declaradas. É isso que permite atualizar só o que mudou.

## Reconhecer um sistema novo

Acrescente uma entrada em `src/signatures/catalog.ts`:

```ts
{
  id: "meu-erp",
  name: "Meu ERP",
  category: "erp",            // erp | pdv | negocio | banco-de-dados | servidor-web | ...
  business: true,             // sistemas de negócio geram pergunta de confirmação
  software: /meu\s*erp/i,     // nome/fabricante/caminho de programa instalado
  service: /meuerp/i,         // nome/descrição/comando de serviço
  process: /^meuerp/i,        // processo escutando em porta
  ports: [9000],              // evidência fraca, só soma se houver outra pista
  config: /meuerp/i,          // DSNs ODBC e tarefas agendadas
  ambiguous: false,           // true se o nome for genérico (reduz a certeza)
}
```

Pontuação (`match.ts`): cada pista forte vale 2 e porta vale 1; ≥ 4 é alta, 2–3 média, 1 baixa.

## Escrever um modelo de skill

Um modelo fica em `src/skills/templates/` e é registrado em `FIXED_TEMPLATES` ou `ADAPTIVE_TEMPLATES`:

```ts
export const impressoras: SkillTemplate = {
  id: "impressoras",
  kind: "adaptavel",
  revision: 1,                      // aumente ao mudar o texto: força regerar as skills deste modelo
  summary: "Problemas de impressão.",
  plan: (ctx) => {
    if (!ctx.list("chamados_comuns").some((c) => /impressora/i.test(c))) return []; // não se aplica
    return [{
      name: "impressoras",
      title: "Impressoras",
      kind: "adaptavel",
      area: "Suporte",
      why: "Impressora está entre os chamados mais comuns.",
      dependsOn: ["empresa:chamados_comuns", "skill-info:impressoras:"],   // o que, se mudar, regera
      needs: [{ key: "fila", question: "Como limpar a fila de impressão travada?", askWho: "TI", why: "..." }],
      build: (info) => ({
        description: "Use quando alguém tiver problema para imprimir...",
        sections: [{ title: "Fila travada", lines: [or(info("fila"), "como limpar a fila")] }],
        guardrails: ["Nunca orientar a reinstalar drivers sem o TI."],
      }),
    }];
  },
};
```

Regras:

- **Leia só pelo `ctx`** (`a()`, `list()`, `mentions()`, `systems()`), e declare em `dependsOn` todo prefixo de fato que você usar. Uma dependência faltando faz a skill ficar desatualizada; uma sobrando só faz regerar à toa.
- Use os fatos derivados `sistema:<id>` e `categoria:<cat>` em vez de `host:`, para não regerar a cada mudança irrelevante numa máquina.
- **Nunca invente:** o que faltar vai em `needs` e aparece no texto como `or(info(key), "...")`. As respostas viram fatos `skill-info:<skill>:<key>`.
- O `name` precisa ser estável. Ele é a pasta da skill e a chave das pendências.

## O servidor MCP entregue

O código do servidor fica em `templates/servidor-mcp/servidor.js`. É JavaScript puro (ESM), para que a empresa só precise de `npm install`, sem compilar nada. Ele usa o SDK oficial `@modelcontextprotocol/sdk` (`McpServer`, `registerTool` / `registerResource` / `registerPrompt`, transporte stdio) e lê tudo de `dados/`.

- **`SERVER_REVISION`** (`delivery/tools.ts`): aumente ao mudar `servidor.js`. Os servidores são refeitos **sem** pedir nova aprovação.
- **`revision` de cada ferramenta:** aumente quando o **comportamento** de uma ferramenta mudar. Ela volta para a revisão do TI.
- **Aprovações** (`aprovacoes.json`): `{ "skill:email": { decision, version, at } }`. Aprovar copia o arquivo para `aprovado/`, e o servidor só lê essas cópias.
- **Geração:** o servidor é um gerador em `generation.ts` que depende de `aprovacao:`, do nome da empresa e das dependências das regras de segurança.

Para testar um servidor gerado com um cliente MCP de verdade:

```js
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const client = new Client({ name: "teste", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: "node", args: ["<pasta>/servidor.js"] }));
console.log(await client.listTools());
console.log(await client.callTool({ name: "buscar_conhecimento", arguments: { pergunta: "como abro um chamado?" } }));
```

## Acrescentar uma pergunta à entrevista

Edite `src/company/levels.ts`. Use um `id` estável (ele é a chave em `company.json`). Para perguntas condicionais, use `showIf`. Depois rode `npm run docs`.

## Acrescentar um coletor

1. Crie `src/collectors/<nome>/` com uma função que devolve dados já mascarados.
2. Estenda `InventorySchema` em `core/schema.ts`.
3. Gere pendências para o que não for interpretável.
4. Crie a ação em `actions.ts` e exponha no menu (`guided.ts`) e na CLI (`cli.ts`).
5. Atualize `core/stages.ts` (progresso da etapa 2), o relatório e `docs/04-analise-tecnica.md`.

## Roadmap

- [x] Entrevista em níveis, pendências, relatório, modo guiado
- [x] Coletor de host (Windows testado; Linux implementado, ainda sem teste em campo)
- [x] Atualização incremental: fatos, diário de mudanças, histórico, regeneração seletiva
- [x] Modelos de skill: 4 fixos + 5 adaptáveis, regeneração por skill, pendências por informação faltante
- [ ] Mais modelos (impressoras, VPN, RH/holerite, PDV...) e enriquecimento opcional por LLM
- [x] Etapa 5: aprovação por versão e servidor MCP com proteções (mascaramento, auditoria, só o aprovado)
- [x] Coletor de bancos: estrutura de SQL Server e PostgreSQL, sem ler dados; senha só em memória; colunas sensíveis viram guardrails
- [ ] Bancos Firebird, MySQL e Oracle
- [x] Consultas aos sistemas: nomeadas, aprovadas por revisão, validadas 2x, parâmetros separados, transação somente leitura, mascaramento
- [x] Modo HTTP (Streamable HTTP, sem estado): chaves por pessoa, só localhost por padrão, HTTPS obrigatório na rede, DNS rebinding, limite por chave, auditoria com quem
- [ ] Ferramentas de escrita com confirmação humana
- [x] Coletor de rede: faixas autorizadas (digitar "autorizado"), TCP connect com limite, banners/HTTP, DNS reverso, ARP, diff entre varreduras
- [ ] Coletor de bancos de dados (estrutura, somente leitura)
