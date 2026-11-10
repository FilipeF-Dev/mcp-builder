# MCP-Builder

**Prepare sua empresa para ter um assistente de IA, sem precisar ser especialista.**

O MCP-Builder entende a sua empresa **do básico ao complexo**: primeiro o negócio, depois a tecnologia. Ele pergunta o que não sabe e entrega ao TI uma base quase pronta para conectar um agente de IA aos sistemas da empresa via [MCP](docs/07-glossario.md).

Feito para **pequenas e médias empresas**.

## Como começar

1. Instale o **Node.js** (versão LTS) em [nodejs.org](https://nodejs.org)
2. Baixe este projeto (**Code → Download ZIP**) e extraia
3. Dê dois cliques em **`Iniciar MCP-Builder.bat`** (Windows) ou rode `./iniciar.sh` (Linux)

Depois é só seguir o menu. Na dúvida, escolha **1. Continuar**.

👉 Guia completo: **[Comece aqui](docs/01-comece-aqui.md)**

## Como funciona

| Etapa | O que acontece | Situação |
|---|---|---|
| 1. Conhecer o negócio | Entrevista em 6 níveis: do ramo de atuação ao que o agente pode fazer | ✅ |
| 2. Mapear a tecnologia | Análise somente leitura dos computadores e varredura da rede (com autorização) | ✅ computadores e rede · 🔜 bancos |
| 3. Resolver pendências | O que a ferramenta não entendeu vira pergunta para uma pessoa | ✅ |
| 4. Montar o agente | Skills e regras de segurança: fixas (LGPD, senhas...) e adaptadas ao que foi encontrado | ✅ |
| 5. Revisar e entregar | O TI aprova item a item; o servidor MCP é montado só com o aprovado, pronto para o Claude | ✅ |

A cada passo, um **relatório no navegador** mostra onde você está, o que já se sabe e o que falta.

Entenda a lógica: **[Como funciona](docs/02-como-funciona.md)**

## Documentação

| Documento | Para quem |
|---|---|
| [Comece aqui](docs/01-comece-aqui.md) | Todos: instalação e primeiros passos |
| [Como funciona](docs/02-como-funciona.md) | Todos: a lógica do processo |
| [A entrevista](docs/03-a-entrevista.md) | Quem vai responder: os 6 níveis, e por quê |
| [A análise técnica](docs/04-analise-tecnica.md) | Quem vai acompanhar o TI |
| [Segurança e privacidade](docs/05-seguranca-e-privacidade.md) | Diretoria e TI |
| [Perguntas frequentes](docs/06-perguntas-frequentes.md) | Todos |
| [Glossário](docs/07-glossario.md) | Todos: MCP, agente, skill... |
| [Atualização contínua](docs/08-atualizacao-continua.md) | TI: rodar de novo e ver só o que mudou |
| [Skills](docs/09-skills.md) | Todos: o que o agente sabe fazer, e por quê |
| [Servidor MCP](docs/10-servidor-mcp.md) | TI: revisar, aprovar e conectar o agente ao Claude |
| [Frentes do projeto](docs/frentes.md) | Quem acompanha a evolução do projeto |
| [Para desenvolvedores](docs/para-desenvolvedores.md) | Quem vai estender a ferramenta |

## Segurança em uma linha

Só lê, nunca altera. Rodar de novo mostra só o que mudou e refaz só o necessário. Senhas são ocultadas na coleta. Os dados ficam no seu computador. [Detalhes](docs/05-seguranca-e-privacidade.md).
