# Consultas aos sistemas

Com as consultas, o agente deixa de só **explicar** e passa a **responder com dados**, por exemplo:

> **Colaborador:** Qual o status do pedido 1532?
> **Agente:** O pedido 1532 está **Em separação**, no valor de R$ 150,00.

## A ideia em uma frase

Uma consulta é uma **pergunta fixa**, criada e aprovada pelo TI, que o agente pode fazer a um sistema. O agente **nunca escreve SQL**: ele só escolhe a consulta certa e informa o valor (o número do pedido, o nome do cliente…).

## Criar uma consulta (sem escrever SQL)

No menu: **4. Montar o agente → 2. Criar uma consulta aos sistemas**. Antes, é preciso ter lido a estrutura do banco (etapa 2).

O assistente pergunta, em ordem:

1. **Em qual banco?** Aparecem os bancos já lidos.
2. **Para que serve?** Ex.: *"Ver o status de um pedido pelo número"*. Essa frase ensina o agente quando usar a consulta.
3. **Qual tabela?** Digite parte do nome (ex.: `pedido`) e escolha.
4. **Quais colunas o agente deve ver?** Colunas com 🔒 são dados sensíveis e **sempre aparecem mascaradas**.
5. **Por quais colunas filtrar?** São os valores que o agente vai informar. Para texto, você escolhe entre "valor exato" e "contém o texto".
6. **Ordem e limite de linhas** (padrão: 20, máximo: 200).

No fim, o assistente mostra o SQL gerado, por exemplo:

```sql
SELECT "id", "status", "total", "criado_em" FROM "public"."pedidos" WHERE "id" = :id LIMIT 20
```

Quem sabe SQL pode escrever a consulta à mão (opção 2 do assistente). Ela passa pela mesma validação.

## Aprovar

Uma consulta nova só funciona **depois de aprovada** em **5. Revisar e aprovar**. Lá, a tecla `v` mostra para que serve a consulta, os parâmetros e o SQL. Se a consulta for alterada depois, o agente continua usando a versão aprovada até a nova ser revisada.

## As proteções, camada por camada

| Camada | O que impede |
|---|---|
| **O agente não escreve SQL** | O agente só pode fazer as perguntas que o TI criou e aprovou |
| **Validação do SQL** (ao criar e de novo quando o servidor inicia) | Só `SELECT`, um único comando, sem comentários e sem nenhuma palavra de escrita ou execução (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `EXEC`, `INTO`…) |
| **Parâmetros separados do SQL** | Injeção de SQL: um nome como `x' OR '1'='1` é tratado como texto, não como comando (testado: 0 resultados) |
| **Tipos nos parâmetros** | Um texto onde se espera número é recusado antes de chegar ao banco |
| **Transação somente leitura** (PostgreSQL) e tempo máximo de 15 s | Escrita e consultas pesadas que travariam o sistema |
| **Limite de linhas** | Respostas enormes e "despejo" de tabelas inteiras |
| **Mascaramento** | Colunas sensíveis do banco (CPF, salário, e-mail…) e padrões como CPF e cartão aparecem como `«oculto»` |
| **Usuário de banco só para o agente** | Mesmo que tudo acima falhasse, o banco recusa o que o usuário não pode fazer |
| **Auditoria** | Toda consulta fica registrada em `logs/`, com os valores já mascarados |

## O usuário de banco do agente

O servidor precisa de um usuário de banco para executar as consultas. Peça ao TI um usuário **só para o agente**, com permissão de leitura **apenas nas tabelas das consultas**. O `LEIA-ME.md` do servidor lista quais são.

**PostgreSQL:**

```sql
CREATE ROLE mcp_agente LOGIN PASSWORD 'troque-por-uma-senha-forte';
GRANT USAGE ON SCHEMA public TO mcp_agente;
GRANT SELECT ON pedidos, clientes TO mcp_agente;   -- só as tabelas das consultas
```

**SQL Server:**

```sql
CREATE LOGIN mcp_agente WITH PASSWORD = 'troque-por-uma-senha-forte';
USE NomeDoBanco;
CREATE USER mcp_agente FOR LOGIN mcp_agente;
GRANT SELECT ON dbo.Pedidos TO mcp_agente;          -- só as tabelas das consultas
```

> É um usuário **diferente** do usado para ler a estrutura (`mcp_leitura`): aquele nunca vê dados; este vê só o que as consultas precisam.

A senha **não fica em nenhum arquivo do servidor**. Ela vai nas variáveis de ambiente da configuração do Claude Desktop (`MCP_DB_<BANCO>_USUARIO` e `MCP_DB_<BANCO>_SENHA`), e o `LEIA-ME.md` mostra exatamente como.

## Boas práticas

- **Comece com poucas consultas**, das perguntas mais frequentes da entrevista (nível 4).
- **Mostre só as colunas necessárias.** Para o status de um pedido, ninguém precisa do CPF do cliente.
- **Sempre filtre por algo** (número, código, nome). Uma consulta sem filtro devolve sempre as mesmas linhas.
- Prefira **views** criadas pelo TI quando a resposta envolver várias tabelas. O assistente lista views também.
- Revise a auditoria (`logs/`) de vez em quando, para ver o que está sendo perguntado.

## Comandos avançados

```bash
mcp-builder consultas          # lista
mcp-builder consultas nova     # assistente
mcp-builder consultas remover <id>
```
