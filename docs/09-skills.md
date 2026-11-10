# Skills: o que o agente sabe fazer

A **etapa 4 (Montar o agente)** transforma tudo o que foi aprendido sobre a empresa em **skills**: instruções que o agente de IA segue para ajudar os colaboradores, cada uma com as suas **regras de segurança**.

## Como as skills são criadas

O MCP-Builder não escreve as skills do zero. Ele usa **modelos de skill**: "skills que geram skills". Cada modelo olha para a entrevista e para a análise técnica e decide se se aplica, quantas skills cria e o que falta saber.

Existem dois tipos:

| Tipo | O que é | Exemplos |
|---|---|---|
| **Fixo** | Vale para **qualquer empresa**. O texto base já vem pronto, e só os detalhes da empresa são preenchidos. | LGPD · senhas e golpes · quando chamar uma pessoa · conduta do assistente |
| **Adaptável** | Só aparece **se fizer sentido** para a empresa, conforme o que foi encontrado. | Uma skill para cada ERP · migração de sistemas · e-mail · abrir chamado · dúvidas frequentes |

## Os modelos disponíveis

### Fixos (sempre criados)

| Skill | Para que serve | O que ela pode pedir |
|---|---|---|
| **Conduta do assistente** | Quem é o agente, tom de voz, o que pode e não pode fazer, transparência | (usa o nível 6 da entrevista) |
| **LGPD e dados pessoais** | Proteger dados pessoais, encaminhar pedidos de titulares, agir em incidentes | Encarregado de dados (DPO); canal para pedidos de titulares |
| **Senhas, acessos e golpes** | Esqueci a senha, pedir acesso, reconhecer golpes | Procedimento de troca de senha; como pedir acesso novo |
| **Quando chamar uma pessoa** | Limites do agente e para quem encaminhar | Contato e horário do suporte; quem acionar em emergências |

### Adaptáveis (criados quando se aplicam)

| Skill | Aparece quando | O que ela pode pedir |
|---|---|---|
| **Sistema {nome}** (uma por ERP/PDV) | A entrevista citou ou a análise encontrou um sistema de gestão | Para que é usado; como acessar; quem dá suporte; situação na migração |
| **Migração de sistemas** | A entrevista informou uma troca de sistema | Cronograma; onde relatar problemas; material de treinamento |
| **E-mail** | Um servidor de e-mail foi encontrado, ou a entrevista citou e-mail | Provedor (se não foi detectado); acesso pelo celular; caixa cheia; conta nova |
| **Abrir um chamado** | Existe ferramenta de chamados (ou GLPI detectado) ou chamados comuns citados | Passo a passo; como indicar urgência |
| **Dúvidas frequentes** | A entrevista listou dúvidas frequentes | A resposta de cada dúvida |

## Quando falta informação

Uma skill nunca inventa. Se falta algo, ela aparece assim no arquivo:

> ⚠ **A definir:** como acessar o Teknisa e quem cria usuários

E vira uma **pendência** com o motivo e a sugestão de quem sabe. Quando alguém responde, **só aquela skill é refeita**, já com a resposta.

O menu, o `status` e o relatório mostram quantas informações faltam em cada skill.

## As regras de segurança (guardrails)

Cada skill traz as suas regras ("Nunca exibir salários", "Nunca pedir senhas"...). Todas são reunidas também em `saida/guardrails.md`, que vale para todas as conversas.

As regras vêm de três fontes:
1. **Fixas:** boas práticas que valem para qualquer empresa (LGPD, senhas).
2. **Da entrevista:** o que o agente **nunca pode fazer** e quais dados são **sensíveis** (nível 6).
3. **Do ambiente:** ex. "nunca orientar uma rotina no sistema X sem confirmar a situação dele na migração".

## Onde ficam

```
workspaces/<empresa>/saida/
├── guardrails.md                       todas as regras de segurança
└── skills/
    ├── conduta-do-assistente/SKILL.md
    ├── lgpd-dados-pessoais/SKILL.md
    ├── sistema-teknisa/SKILL.md
    └── ...
```

Cada `SKILL.md` segue o formato aberto **Agent Skills**: um cabeçalho com nome e descrição de quando usar, seguido das instruções. É o formato usado por agentes como o Claude.

## Quando a empresa muda

As skills seguem a [atualização contínua](08-atualizacao-continua.md):

| Mudou | O que é refeito |
|---|---|
| Servidor de e-mail trocado | Só a skill de **e-mail** (e as regras consolidadas) |
| Resposta da entrevista corrigida | Só as skills que usam aquela resposta |
| Pendência de uma skill respondida | Só aquela skill |
| Um sistema sumiu e ninguém mais o cita | A skill dele é **removida** |
| A própria ferramenta melhorou o texto de um modelo | Só as skills daquele modelo |

Cada skill tem uma **versão** (v1, v2...) que aumenta a cada vez que é refeita, visível no relatório.

## Por que a entrevista precisa estar completa

As skills só são montadas depois dos 6 níveis da entrevista. O **nível 6** define o que o agente pode fazer, o que nunca pode e quais dados são sensíveis. Sem isso, não há como escrever as regras de segurança, e um agente sem regras não deve existir.
