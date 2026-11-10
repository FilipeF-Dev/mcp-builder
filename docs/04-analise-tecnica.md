# A análise técnica

A **etapa 2** examina a tecnologia da empresa para descobrir quais sistemas existem e como eles se conectam. Ela confirma e completa o que as pessoas contaram na entrevista.

No menu, **3. Mapear a tecnologia** oferece duas análises que se completam:

| Análise | O que vê | Quando usar |
|---|---|---|
| **Este computador** | Tudo o que está **instalado** na máquina: programas, serviços, tarefas, conexões | Em cada servidor principal e em um computador típico de cada área |
| **A rede** | O que cada equipamento da rede **oferece**: banco de dados, e-mail, sites internos, impressoras... | Uma vez no começo, para ter o mapa geral, e sempre que algo mudar |
| **Bancos de dados** | A **estrutura** de cada banco (tabelas e colunas), nunca os dados | Nos bancos que a rede encontrou, com um usuário de leitura criado pelo TI |

**Ordem sugerida:** primeiro a rede, para descobrir onde estão os servidores e bancos; depois os bancos; depois a análise de computador nos servidores que importam.

## Varredura de rede

### Antes de tudo: autorização

Varrer uma rede sem permissão pode violar regras da empresa e disparar alarmes de segurança. Por isso:

- **Peça autorização** ao responsável pela rede (interno ou empresa terceirizada) e **avise quem cuida da segurança**.
- A ferramenta só varre faixas **escolhidas explicitamente**. Ela sugere as redes deste computador, mas nunca varre sem você escolher.
- Para confirmar, é preciso **digitar a palavra `autorizado`**. Responder "sim" não basta.
- Cada varredura fica registrada: quando, quais faixas, quantos endereços e qual usuário fez.
- Limite de **4.096 endereços** por varredura, para evitar varreduras enormes por engano.

### Como escolher a faixa

A ferramenta mostra as redes deste computador, por exemplo:

```
1. 192.168.10.0/24   (rede da placa "Wi-Fi", este computador é 192.168.10.25)
2. 172.20.160.0/20   (rede da placa "vEthernet (WSL...)"; parece virtual)
D. Digitar outra (ex.: 192.168.1.0/24, 10.0.0.10-50)
```

Redes marcadas como **virtuais** normalmente são do próprio computador (WSL, Docker, máquinas virtuais), não da empresa. Se a empresa tem várias redes (matriz, filiais, servidores), peça ao TI a lista de faixas.

| Formato | Exemplo | Significa |
|---|---|---|
| CIDR | `192.168.1.0/24` | De 192.168.1.1 a 192.168.1.254 |
| Intervalo | `192.168.1.10-50` | De 192.168.1.10 a 192.168.1.50 |
| Um endereço | `192.168.1.20` | Só esse |

### O que a varredura faz

1. **Procura equipamentos:** testa algumas portas comuns em cada endereço. Responder, mesmo recusando, prova que o equipamento existe. A tabela ARP do computador acrescenta equipamentos que bloqueiam tudo.
2. **Verifica serviços:** nos equipamentos encontrados, testa cerca de 40 portas de serviços conhecidos (SQL Server, PostgreSQL, Firebird, e-mail, web, compartilhamento de arquivos, impressão, acesso remoto...).
3. **Identifica:** busca o nome do equipamento (DNS) e lê o que cada serviço apresenta, como a primeira linha de um servidor de e-mail ou o título de uma página web. Nenhum login é tentado.
4. **Classifica** cada equipamento por tipo provável (controlador de domínio, servidor de banco de dados, impressora, computador Windows...) e **reconhece sistemas** pelo mesmo catálogo da análise de computador.

A velocidade é limitada (no máximo 64 conexões ao mesmo tempo), para não pesar na rede. Uma rede `/24` leva de 30 segundos a 2 minutos.

### O que vira pendência

- **Bancos de dados encontrados:** "qual sistema usa esse banco e quem é o responsável?" Esses bancos aparecem como sugestão na leitura de bancos.
- **Sites internos não reconhecidos:** "o endereço http://192.168.1.20:8080 é de qual sistema?"
- **Protocolos sem criptografia** (FTP, Telnet): "ainda são usados? para quê?"
- **Mudanças entre varreduras:** um sistema que apareceu ou sumiu.

### Limites

- Equipamentos com firewall que bloqueia tudo podem não aparecer (em outras redes, a tabela ARP não ajuda).
- O **tipo** do equipamento é uma hipótese baseada nas portas abertas, e o relatório deixa isso claro.
- Só IPv4.

## Leitura de bancos de dados

### O que é lido, e o que não é

| É lido | Nunca é lido |
|---|---|
| Nomes de bancos, esquemas, tabelas, views e procedures | Nenhuma linha de nenhuma tabela |
| Nomes e tipos de colunas, chaves e relacionamentos | Clientes, pedidos, salários, notas... |
| A **estimativa** de linhas que o próprio banco guarda nas estatísticas | |

As consultas são fixas, apenas no catálogo do banco. No PostgreSQL, a sessão é aberta em modo somente leitura. A senha é pedida na hora (sem aparecer na tela), usada só em memória e **nunca gravada**.

Hoje: **SQL Server** e **PostgreSQL**. Firebird, MySQL e Oracle em próximas versões.

### Peça ao TI um usuário que NÃO consegue ler dados

O ideal é um usuário criado só para isso, que enxerga a estrutura mas **não tem permissão de ler os dados**. Assim, mesmo que a senha vaze, ninguém lê nada com ela.

**PostgreSQL**: basta poder conectar (por padrão, todo usuário pode):

```sql
CREATE ROLE mcp_leitura LOGIN PASSWORD 'troque-por-uma-senha-forte';
-- Só se a empresa tiver retirado a permissão padrão de conexão:
GRANT CONNECT ON DATABASE nome_do_banco TO mcp_leitura;
```

**SQL Server**: em cada banco a ser lido:

```sql
-- No servidor, uma vez:
CREATE LOGIN mcp_leitura WITH PASSWORD = 'troque-por-uma-senha-forte';
-- Em cada banco:
USE NomeDoBanco;
CREATE USER mcp_leitura FOR LOGIN mcp_leitura;
GRANT VIEW DEFINITION TO mcp_leitura;   -- enxerga a estrutura, não os dados
```

> O conector de PostgreSQL foi testado com um usuário assim: ele leu toda a estrutura e não conseguiu ler nenhuma linha. O de SQL Server ainda não foi testado com um servidor real.

Depois da leitura, o TI pode desativar o usuário até a próxima atualização.

### O que a ferramenta tira da estrutura

- **Sistema provável:** pelo nome do banco e dos esquemas (ex.: um banco `teknisa_prod`).
- **Áreas de negócio:** pelos nomes das tabelas (clientes, produtos, estoque, vendas, compras, financeiro, fiscal, RH, cardápio e produção, usuários).
- **Maiores tabelas:** pela estimativa do próprio banco. Costumam ser o "coração" do sistema.
- **Dados pessoais e sensíveis** (LGPD), pelos nomes das colunas: CPF, CNPJ, RG, PIS, data de nascimento, salário, senha, cartão, dados bancários, e-mail, telefone, endereço, saúde.

Os dados sensíveis encontrados **viram regras de segurança automaticamente**: a skill de LGPD passa a listar onde eles estão, e as regras do agente proíbem expô-los.

### O que vira pendência

- Banco cujo sistema não foi reconhecido: "o banco X pertence a qual sistema?"
- Colunas de senha: "elas são guardadas com criptografia ou em texto?"
- Mudanças entre leituras: tabelas novas, removidas ou alteradas, e principalmente **coluna nova com dado sensível** (importante).

A estrutura completa de cada banco fica em `workspaces/<empresa>/bancos/` (para o TI), e um resumo legível em `context/12-bancos.md`.

## Análise de computador

### Em quais computadores rodar

A análise examina **o computador onde a ferramenta está aberta**. Rode em:

1. **Cada servidor importante** (o ERP, o banco de dados, o servidor de arquivos...). A varredura de rede mostra quais são.
2. **Um computador típico de cada área** (financeiro, compras, loja, cozinha...). Mostra o que as pessoas realmente usam.

Copie a pasta do MCP-Builder para cada máquina, ou rode a partir de uma pasta compartilhada. Cada análise é somada à mesma empresa. Se rodar de novo no mesmo computador, a ferramenta compara com a análise anterior e mostra só o que mudou.

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
