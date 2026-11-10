# A entrevista

<!-- Arquivo gerado automaticamente por `npm run docs` a partir de src/company/levels.ts. Não edite à mão. -->

A entrevista é a **etapa 1** e a base de todo o processo. Ela vai do básico ao complexo em 6 níveis.
Os níveis 1 a 2 precisam estar concluídos antes da análise técnica (etapa 2).

## Quem chamar para responder

| Níveis | Quem costuma saber |
|---|---|
| 1 e 2 | Dono, diretoria ou gerente geral |
| 3 e 4 | Gestores das áreas, RH e TI |
| 5 | TI e usuários-chave dos sistemas |
| 6 | Diretoria junto com o TI |

Não precisa ser tudo de uma vez nem com a mesma pessoa. Quando não souber, digite `?`: a pergunta vira uma pendência com a sugestão de quem procurar.

## Comandos durante a entrevista

| Digite | Para |
|---|---|
| o número da opção | escolher (várias: `1,3,4`) |
| `?` | "não sei": vira pendência para outra pessoa |
| Enter (vazio) | pular uma pergunta opcional |
| `!sair` | salvar e voltar ao menu |

Para corrigir respostas já dadas: no menu, opção **7. Corrigir respostas da entrevista**.

## Nível 1: Identidade e ramo de atuação

**Por que este nível:** Antes de qualquer coisa, o agente precisa saber de que empresa está falando e em que mundo ela vive.

**O que ele embasa:** Vocabulário e glossário do agente; Tom de voz; Quais tipos de sistema esperar na análise técnica.

| Pergunta | Tipo | Obrigatória |
|---|---|---|
| Qual o ramo de atuação principal?<br><sub>Opções: Alimentação / food service · Indústria · Varejo · Atacado / distribuição · Serviços · Saúde · Educação · Tecnologia · Logística / transporte · Agronegócio · Construção · Outro</sub> | escolha uma opção | sim |
| Descreva o segmento com mais precisão.<br><sub>Ex.: refeições coletivas para empresas, panificação industrial, rede de restaurantes self-service.</sub> | texto livre | sim |
| Em uma ou duas frases: o que a empresa faz e para quem? | texto livre | sim |
| Quantos colaboradores, aproximadamente?<br><sub>Opções: Até 50 · 51 a 200 · 201 a 500 · 501 a 1.000 · 1.001 a 5.000 · Mais de 5.000</sub> | escolha uma opção | sim |
| Onde fica a sede (cidade/UF)? | texto livre | sim |
| Em quais cidades/estados a empresa opera?<br><sub>Ex.: só Grande SP; SP, RJ e MG; nacional.</sub> | texto livre | não |

## Nível 2: Como a empresa atua

**Por que este nível:** Saber como o dinheiro entra e como a operação flui define quais sistemas são críticos e quando não se pode errar.

**O que ele embasa:** Quais sistemas o agente deve priorizar; Janelas de horário críticas (guardrails de disponibilidade); Quais integrações mapear primeiro.

| Pergunta | Tipo | Obrigatória |
|---|---|---|
| Qual o modelo de negócio?<br><sub>Opções: B2B (vende para empresas) · B2C (vende para consumidor final) · Ambos · Governo / licitações · Outro</sub> | escolha uma opção | sim |
| Quem são os clientes típicos? | texto livre | sim |
| Por quais canais a empresa vende ou entrega?<br><sub>Opções: Lojas / restaurantes próprios · Franquias · Delivery / apps (iFood etc.) · E-commerce próprio · Contratos corporativos (unidades em clientes) · Representantes / venda direta · Atacado / distribuidores · Outro</sub> | escolha uma ou mais | sim |
| Quais apps/plataformas de delivery?<br><sub>(aparece só quando faz sentido, conforme respostas anteriores)</sub> | texto livre | não |
| Que tipos de unidade existem?<br><sub>Opções: Escritório / sede administrativa · Fábrica / cozinha central · Centro de distribuição / estoque · Lojas / pontos de venda · Unidades dentro de clientes · Trabalho remoto · Outro</sub> | escolha uma ou mais | sim |
| Quantas unidades/locais no total, aproximadamente? | número | sim |
| Descreva o fluxo principal do negócio, do pedido/compra até a entrega e o faturamento.<br><sub>Ex.: cliente fecha contrato → nutricionista monta cardápio → compras → cozinha produz → entrega na unidade → faturamento mensal.</sub> | texto livre | sim |
| Quais dias/horários são críticos (quando um sistema parado é inaceitável)? | texto livre | sim |
| Existe sazonalidade relevante (meses de pico, datas especiais)? | texto livre | não |

## Nível 3: Estrutura e pessoas

**Por que este nível:** O agente vai atender pessoas. Precisamos saber quem são, de que áreas, e que familiaridade têm com tecnologia.

**O que ele embasa:** Perfis de acesso e permissões; Linguagem das respostas; Ordem de implantação por área; Obrigações regulatórias.

| Pergunta | Tipo | Obrigatória |
|---|---|---|
| Quais são as áreas/departamentos? (separe por ;)<br><sub>Ex.: Operações; Compras; Financeiro; RH; Comercial; Nutrição; TI</sub> | lista (separe por ;) | sim |
| Quais áreas ou perfis vão usar o agente primeiro? (separe por ;) | lista (separe por ;) | sim |
| Familiaridade média desses usuários com tecnologia:<br><sub>Opções: Baixa (precisam de passo a passo) · Média · Alta</sub> | escolha uma opção | sim |
| Como é o time de TI? (pessoas internas, terceiros, empresas parceiras) | texto livre | sim |
| Quais regulações afetam a operação?<br><sub>Opções: LGPD · Vigilância sanitária / ANVISA · Fiscal (NF-e, SPED) · Trabalhista (eSocial, ponto) · PCI (cartões de pagamento) · ISO / certificações · Outro</sub> | escolha uma ou mais | não |

## Nível 4: Processos-chave e dúvidas do dia a dia

**Por que este nível:** As skills do agente nascem daqui: processos que as pessoas executam e dúvidas que mais se repetem.

**O que ele embasa:** Lista de skills do agente; Base de conhecimento (FAQ); Quais ações automatizar primeiro.

| Pergunta | Tipo | Obrigatória |
|---|---|---|
| Quais são os processos mais importantes do dia a dia? (5 a 10, separe por ;) | lista (separe por ;) | sim |
| Quais dúvidas os colaboradores mais levam ao TI ou aos colegas? (separe por ;) | lista (separe por ;) | sim |
| Quais os chamados de suporte mais comuns? (separe por ;)<br><sub>Ex.: reset de senha; impressora; acesso ao ERP; VPN; e-mail cheio</sub> | lista (separe por ;) | sim |
| Onde os chamados são registrados hoje?<br><sub>Ex.: GLPI, e-mail, WhatsApp, planilha, nenhum.</sub> | texto livre | não |
| Existem manuais, POPs ou base de conhecimento? Onde ficam? | texto livre | não |

## Nível 5: Sistemas e dados (visão do negócio)

**Por que este nível:** Antes de analisar os computadores, perguntamos o que as pessoas USAM. A análise depois confirma, detalha e encontra o que ninguém lembrou.

**O que ele embasa:** Onde a análise técnica deve olhar primeiro; Fontes da verdade de cada dado; Conectores do MCP.

| Pergunta | Tipo | Obrigatória |
|---|---|---|
| Qual o ERP ou sistema de gestão principal? | texto livre | sim |
| Há sistemas em migração ou desativação? (qual substitui qual, e prazo)<br><sub>Importante: o agente não pode mandar ninguém para o sistema que está sendo desligado.</sub> | texto livre | sim |
| Outros sistemas usados (PDV, fiscal, RH/folha, ponto, BI, CRM, e-mail...)? (separe por ;) | lista (separe por ;) | sim |
| Onde os sistemas rodam?<br><sub>Opções: Tudo local (servidores próprios) · Tudo em nuvem / SaaS · Híbrido · Não sei</sub> | escolha uma opção | sim |
| Para pedidos, estoque, funcionários e clientes: qual sistema é a fonte da verdade de cada um? | texto livre | não |
| Quais sistemas trocam dados entre si, e como? | texto livre | não |

## Nível 6: O agente: objetivos e limites

**Por que este nível:** Por último, com o contexto completo, definimos o que o agente deve e não deve fazer.

**O que ele embasa:** Guardrails; Escopo das tools (leitura x escrita); Fluxo de aprovação; Canal de atendimento.

| Pergunta | Tipo | Obrigatória |
|---|---|---|
| O que seria um sucesso para o agente nos primeiros 3 meses? | texto livre | sim |
| O que o agente PODE fazer? (separe por ;)<br><sub>Ex.: explicar procedimentos; consultar status de pedido; abrir chamado; consultar estoque</sub> | lista (separe por ;) | sim |
| O que o agente NUNCA pode fazer ou acessar? (separe por ;) | lista (separe por ;) | sim |
| Quais dados são sensíveis? (separe por ;)<br><sub>Ex.: salários; dados pessoais de clientes; financeiro; receitas/fichas técnicas</sub> | lista (separe por ;) | sim |
| Quem aprova novas capacidades do agente? | texto livre | sim |
| Por onde os colaboradores vão falar com o agente?<br><sub>Opções: Microsoft Teams · WhatsApp · Slack · Página web / intranet · Claude (desktop/web) · Outro</sub> | escolha uma ou mais | sim |
| Tom de voz do agente:<br><sub>Opções: Formal · Cordial e direto · Descontraído</sub> | escolha uma opção | sim |

## Importar respostas de um formulário

Se preferir coletar as respostas por outro meio (formulário, e-mail), monte um arquivo JSON com o identificador de cada pergunta e importe com:

```bash
mcp-builder entrevista --importar respostas.json
```

Identificadores disponíveis:

- **Nível 1:** `ramo`, `segmento`, `o_que_faz`, `colaboradores`, `sede`, `regioes`
- **Nível 2:** `modelo`, `clientes`, `canais`, `apps_delivery`, `unidades_tipos`, `unidades_qtd`, `cadeia_valor`, `horarios_criticos`, `sazonalidade`
- **Nível 3:** `areas`, `usuarios_agente`, `familiaridade`, `ti_estrutura`, `regulacoes`
- **Nível 4:** `processos`, `duvidas_frequentes`, `chamados_comuns`, `ferramenta_chamados`, `documentacao`
- **Nível 5:** `erp`, `migracoes`, `outros_sistemas`, `hospedagem`, `fontes_verdade`, `integracoes`
- **Nível 6:** `objetivo`, `pode_fazer`, `nao_pode`, `dados_sensiveis`, `aprovador`, `canal`, `tom`

Exemplo:

```json
{
  "ramo": "Alimentação / food service",
  "colaboradores": 3,
  "areas": [
    "Operações",
    "Compras",
    "RH"
  ],
  "unidades_qtd": "?"
}
```

O valor `"?"` registra a pergunta como pendência.
