# Segurança e privacidade

## Resumo

- A ferramenta **só lê** informações. Não instala, não altera e não apaga nada.
- **Senhas e chaves** encontradas são **ocultadas** antes de qualquer coisa ser gravada.
- Nas etapas 1 a 3, **nada sai do computador**. Tudo fica na pasta `workspaces/`.
- Nada do que o assistente fará entra em uso sem **aprovação de uma pessoa**.

## Antes de começar: autorização

A análise técnica examina computadores e servidores da empresa. Mesmo sendo somente leitura:

1. **Peça autorização por escrito** ao responsável pela empresa e ao responsável pela infraestrutura (interno ou terceirizado).
2. **Avise o TI ou o prestador de segurança.** Alguns antivírus e sistemas de monitoramento podem estranhar uma ferramenta listando serviços e portas.
3. A varredura de **rede** só roda em faixas escolhidas explicitamente, exige digitar `autorizado` e fica registrada (quando, faixas, usuário). Detalhes em [A análise técnica](04-analise-tecnica.md#varredura-de-rede).

## O que a ferramenta lê

Veja a tabela completa em [A análise técnica](04-analise-tecnica.md#o-que-é-lido). Em resumo: **configuração** dos computadores (programas, serviços, portas, tarefas agendadas), nunca **conteúdo** (documentos, e-mails, dados de clientes, conteúdo de bancos de dados).

## Senhas ocultadas automaticamente

É comum senhas aparecerem em configurações, como uma tarefa de backup com a senha na linha de comando ou uma conexão de banco de dados com a senha embutida. A ferramenta reconhece esses padrões e troca o valor por `«oculto»` **no momento da coleta**, antes de gravar:

| Encontrado | Gravado |
|---|---|
| `Server=srv01;User Id=sa;Password=S3nh@F0rte;` | `Server=srv01;User Id=sa;Password=«oculto»;` |
| `sqlcmd -S srv -U sa -P minhasenha` | `sqlcmd -S srv -U sa -P «oculto»` |
| `https://joao:abc123@api.empresa.com` | `https://joao:«oculto»@api.empresa.com` |
| `Authorization: Bearer eyJhbGciOi...` | `Authorization: Bearer «oculto»` |

Também são reconhecidos tokens comuns (GitHub, AWS, JWT, chaves privadas). A regra é: **na dúvida, oculta**.

> Nenhum filtro é perfeito. Por isso, a pasta `workspaces/` deve ser tratada como **informação interna e confidencial**.

## Onde os dados ficam

```
workspaces/<empresa>/
```

- A pasta fica **apenas no computador** onde a ferramenta roda.
- Ela é **ignorada pelo Git** (`.gitignore`): mesmo que alguém publique o projeto, os dados da empresa não vão junto.
- Para apagar tudo sobre uma empresa, basta apagar a pasta dela.

## O relatório

O `relatorio.html` resume o que se sabe sobre a empresa, incluindo nomes de computadores e sistemas. **Compartilhe só com quem precisa** (diretoria, TI). Ele não contém senhas.

## Envio para uma IA externa

**Hoje, nada é enviado.** A montagem das skills (etapa 4) usa modelos prontos e roda inteira no seu computador.

Se no futuro houver uma opção de enriquecer as skills com uma IA externa, ela seguirá estas regras:

- senhas já foram ocultadas na coleta;
- **dados pessoais** (nomes de colaboradores, CPFs, e-mails) serão removidos ou mascarados;
- a ferramenta vai mostrar **o que será enviado** e pedir confirmação.

## LGPD

O MCP-Builder coleta **dados sobre a tecnologia da empresa**, não sobre pessoas. Ainda assim:

- nomes de usuários podem aparecer (por exemplo, a conta que executa uma tarefa agendada);
- a entrevista pode citar nomes de responsáveis.

Inclua o uso da ferramenta no registro de atividades de tratamento da empresa, se houver, e trate a pasta `workspaces/` como dado interno.

## Bancos de dados

- Só a **estrutura** é lida (nomes de tabelas e colunas). Nenhuma linha de dados.
- A senha do banco é pedida na hora, não aparece na tela e **nunca é gravada**. Na linha de comando, ela vem de uma variável de ambiente, nunca de um argumento (que ficaria no histórico).
- Recomendado: um usuário de banco **sem permissão de ler dados** (veja [A análise técnica](04-analise-tecnica.md#peça-ao-ti-um-usuário-que-não-consegue-ler-dados)).
- Colunas com dados pessoais encontradas viram regras de segurança automaticamente.

## O servidor MCP

As **consultas aos sistemas** têm várias camadas de proteção: o agente não escreve SQL, as consultas são validadas e aprovadas, os parâmetros vão separados do SQL, a transação é somente leitura e o usuário de banco do agente só lê as tabelas necessárias. Veja [Consultas aos sistemas](11-consultas.md#as-proteções-camada-por-camada).


O servidor entregue na etapa 5 aplica as regras também em código: só existe para o agente o que o TI aprovou; CPF, CNPJ, números de cartão e senhas são mascarados em toda resposta; e cada consulta fica registrada em `logs/` (com os argumentos já mascarados). Detalhes em [Servidor MCP](10-servidor-mcp.md).

## O assistente que será construído

As regras de segurança do assistente (guardrails) são definidas no **nível 6 da entrevista**: o que ele pode fazer, o que nunca pode fazer e quais dados são sensíveis. O padrão será sempre:

- **somente leitura**, a menos que uma ação de escrita seja aprovada explicitamente;
- **dados sensíveis** bloqueados;
- **registro** (log) de tudo o que o assistente consultar.
