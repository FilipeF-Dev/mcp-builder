# A análise técnica

A **etapa 2** examina os computadores da empresa para descobrir quais sistemas existem e como eles se conectam. Ela confirma e completa o que as pessoas contaram na entrevista.

## Em quais computadores rodar

A análise examina **o computador onde a ferramenta está aberta**. Para ter uma visão completa, rode em:

1. **Cada servidor** (o ERP, o banco de dados, o servidor de arquivos...). É lá que estão os sistemas.
2. **Um computador típico de cada área** (financeiro, compras, loja, cozinha...). Mostra o que as pessoas realmente usam.

Copie a pasta do MCP-Builder para cada máquina, ou rode a partir de uma pasta compartilhada. Cada análise é somada à mesma empresa. Se rodar de novo no mesmo computador, a análise anterior é substituída.

> **Próximas versões:** análise da rede (descobrir os servidores sem precisar ir em cada um) e leitura da estrutura dos bancos de dados.

## O que é lido

| O quê | Para que serve |
|---|---|
| Sistema operacional, fabricante, memória | Saber se é servidor ou estação, e de que porte |
| Programas instalados | Reconhecer ERP, PDV, banco de dados, backup... |
| Serviços (programas que rodam sozinhos) | Saber o que esta máquina **oferece** para as outras |
| Portas de rede abertas | Saber quais sistemas aceitam conexões de outros computadores |
| Tarefas agendadas | Encontrar rotinas e integrações automáticas (backups, envio de arquivos, sincronizações) |
| Conexões ODBC | Descobrir quais bancos de dados planilhas e sistemas acessam |

**Não é lido:** documentos, e-mails, arquivos pessoais, histórico de navegação, conteúdo de bancos de dados. Veja [Segurança e privacidade](05-seguranca-e-privacidade.md).

## Como os sistemas são reconhecidos

A ferramenta tem um **catálogo de sistemas conhecidos**, como ERPs brasileiros (TOTVS, Teknisa, Senior, Sankhya...), bancos de dados (SQL Server, PostgreSQL, Firebird...) e ferramentas de backup e acesso remoto. Cada sistema tem "pistas": nomes de programas, de serviços e de processos, e portas típicas.

Cada pista encontrada soma pontos, e o total vira um **nível de certeza**:

| Certeza | Significa | Exemplo |
|---|---|---|
| **Alta** | Várias pistas fortes | Programa instalado **e** serviço rodando |
| **Média** | Uma pista forte | Só o programa instalado |
| **Baixa** | Pista fraca ou ambígua | Um nome genérico que pode ser outra coisa |

Uma porta aberta, sozinha, nunca identifica um sistema: a mesma porta pode ser usada por programas diferentes.

## Quando vira uma pendência

A ferramenta gera uma pergunta para uma pessoa quando:

- **Encontra um sistema de negócio que ninguém citou na entrevista:** ele ainda é usado? Por quem?
- **Encontra um sistema citado numa migração:** qual o papel dele hoje, em uso, em implantação ou desativado?
- **A certeza é baixa e a entrevista não ajuda a confirmar:** isso é mesmo o sistema X?
- **Um programa desconhecido aceita conexões da rede:** que sistema é esse?
- **Uma tarefa agendada roda um script:** o que ela faz? Muitas integrações caseiras são assim.
- **Existe uma conexão ODBC configurada:** para qual banco ela aponta, e quem usa?

Cada pendência mostra **por que foi perguntada** (a evidência) e **quem provavelmente sabe**.

## O cruzamento com a entrevista

É aqui que o princípio "do básico ao complexo" aparece na prática. Se a entrevista diz que *"o sistema A está sendo substituído pelo B"* e a análise encontra os dois num computador, a ferramenta não supõe nada: pergunta qual é o papel de cada um hoje. Assim o assistente nunca manda alguém usar o sistema que está sendo desligado.

## Como acrescentar um sistema ao catálogo

O catálogo fica em `src/signatures/catalog.ts`. Para reconhecer um sistema novo, peça a alguém técnico para acrescentar uma entrada (o formato está explicado no próprio arquivo e em [Para desenvolvedores](para-desenvolvedores.md)). Contribuições para o projeto são bem-vindas: cada sistema acrescentado ajuda todas as empresas que usam a ferramenta.
