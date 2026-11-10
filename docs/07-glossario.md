# Glossário

Termos técnicos explicados em português claro, em ordem alfabética.

**Agente (de IA)**
Um assistente de IA que, além de conversar, consegue **fazer coisas**: consultar um sistema, abrir um chamado, buscar um documento. É o que o MCP-Builder ajuda a criar.

**Análise técnica**
Etapa 2 do processo: a ferramenta lê a configuração de um computador (programas, serviços, portas) para descobrir quais sistemas existem. Também chamada de *scan*.

**Assinatura**
O conjunto de "pistas" que identifica um sistema: nomes de programas, serviços e portas típicas. Fica no catálogo da ferramenta.

**Banco de dados**
Onde os sistemas guardam as informações (pedidos, estoque, funcionários). Exemplos: SQL Server, PostgreSQL, Firebird, MySQL.

**Contexto**
Tudo o que o assistente precisa **saber** sobre a empresa para responder bem: o que ela faz, quais áreas existem, quais sistemas usa, como funcionam os processos.

**ERP**
O sistema de gestão principal da empresa, que integra compras, estoque, financeiro, fiscal etc. Exemplos: TOTVS, Teknisa, SAP, Senior.

**Fato**
Uma pequena informação independente sobre a empresa, como "a sede fica em Campinas" ou "o servidor SRV01 tem SQL Server". Comparar os fatos de duas análises mostra exatamente o que mudou. Veja [Atualização contínua](08-atualizacao-continua.md).

**Guardrail (regra de segurança)**
Um limite que o assistente **nunca** ultrapassa. Exemplos: "nunca mostrar salários", "nunca alterar um pedido sem aprovação", "nunca responder sobre dados de clientes".

**Histórico / diário de mudanças**
O registro de tudo o que mudou entre uma análise e outra, e de toda resposta corrigida. Nada é apagado.

**Host**
Qualquer computador da rede: servidor ou estação de trabalho.

**LLM**
O "cérebro" de um assistente de IA, o modelo de linguagem que entende e escreve texto. Exemplo: Claude.

**MCP (Model Context Protocol)**
Um padrão aberto que funciona como uma **tomada universal** entre assistentes de IA e sistemas. Em vez de criar uma integração diferente para cada IA, a empresa cria um **servidor MCP** uma vez, e qualquer assistente compatível consegue usá-lo, sempre dentro das regras definidas.

**ODBC**
Um jeito padrão do Windows de programas (inclusive o Excel) se conectarem a bancos de dados. Uma conexão ODBC configurada indica que alguém naquele computador acessa um banco de dados.

**Pendência**
Uma pergunta que a ferramenta não conseguiu responder sozinha e precisa de uma pessoa. Cada uma mostra por que foi perguntada e quem provavelmente sabe.

**Porta (de rede)**
Uma "porta de entrada" numerada de um computador. Quando um programa "escuta" numa porta, outros computadores podem se conectar a ele. A porta 1433, por exemplo, costuma ser do SQL Server.

**Serviço**
Um programa que roda sozinho, em segundo plano, normalmente desde que o computador liga. Servidores de banco de dados e de sistemas são serviços.

**Servidor MCP**
O programa que a etapa 5 vai entregar: ele conecta o assistente aos sistemas da empresa, aplicando as regras de segurança.

**Skill (habilidade)**
Um procedimento que o assistente sabe executar ou explicar, passo a passo. Exemplos: "como abrir um chamado", "como consultar o status de um pedido", "como resetar a senha do ERP".

**Somente leitura**
A ferramenta só **consulta** informações: não altera, não instala e não apaga nada.

**Tarefa agendada**
Um programa ou script que o computador executa automaticamente em horários definidos, como um backup toda noite ou o envio de arquivos para um parceiro. Muitas integrações entre sistemas funcionam assim.

**Workspace**
A pasta com tudo o que se sabe sobre uma empresa: `workspaces/<nome-da-empresa>/`.
