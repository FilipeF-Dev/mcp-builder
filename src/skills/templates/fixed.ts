/**
 * MODELOS FIXOS: conceitos válidos para qualquer empresa.
 * O texto base é sempre o mesmo; só os detalhes da empresa são preenchidos.
 */
import type { SkillTemplate } from "../types.js";
import { bullets, lc, or, todo, toneLine } from "./helpers.js";

// ─────────────────────────── LGPD ───────────────────────────
export const lgpd: SkillTemplate = {
  id: "lgpd",
  kind: "fixo",
  revision: 3,
  summary: "Tratamento de dados pessoais conforme a LGPD (Lei 13.709/2018).",
  plan: (ctx) => [
    {
      name: "lgpd-dados-pessoais",
      title: "LGPD e dados pessoais",
      kind: "fixo",
      area: "Segurança",
      why: "Toda empresa brasileira que trata dados pessoais está sujeita à LGPD.",
      dependsOn: ["empresa:dados_sensiveis", "empresa:nao_pode", "empresa:regulacoes", "empresa:nome", "skill-info:lgpd-dados-pessoais:", "dados-sensiveis:"],
      needs: [
        {
          key: "encarregado",
          question: "Quem é o encarregado de dados (DPO) da empresa, e qual o contato dele?",
          askWho: "Jurídico / Diretoria",
          why: "O agente precisa saber para onde encaminhar pedidos e dúvidas sobre dados pessoais.",
        },
        {
          key: "canal_titular",
          question: "Por qual canal um colaborador ou cliente pede acesso, correção ou exclusão dos próprios dados?",
          askWho: "Jurídico / RH",
          why: "Pedidos de titulares devem ir para o canal oficial, nunca ser atendidos pelo agente.",
        },
      ],
      build: (info) => {
        const sensitive = ctx.sensitiveData();
        return {
        description: `Use sempre que uma conversa envolver dados pessoais (nome, CPF, endereço, telefone, salário, saúde, dados de clientes ou colaboradores) na ${ctx.name}, ou quando alguém pedir acesso, correção ou exclusão de dados.`,
        sections: [
          {
            title: "Princípios",
            lines: [
              "- **Necessidade:** use apenas os dados pessoais estritamente necessários para responder.",
              "- **Finalidade:** dados só podem ser usados para o propósito da solicitação, nunca para outro.",
              "- **Mínimo de exposição:** prefira respostas agregadas ou anonimizadas (\"3 pedidos pendentes\" em vez de nomes de clientes).",
              "- **Na dúvida, não mostre.** Explique que não pode compartilhar e indique o canal correto.",
            ],
          },
          {
            title: "Dados que esta empresa considera sensíveis",
            lines: bullets(ctx.list("dados_sensiveis"), todo("quais dados são sensíveis (nível 6 da entrevista)")),
          },
          ...(sensitive.size
            ? [
                {
                  title: "Onde há dados pessoais nos sistemas",
                  lines: [
                    "A leitura da estrutura dos bancos encontrou estes tipos de dado pessoal ou sensível. Trate qualquer informação desses tipos como protegida:",
                    "",
                    ...[...sensitive].map(([kind, cols]) => `- **${kind}:** ${cols.length} coluna(s), por exemplo ${cols.slice(0, 3).join(", ")}`),
                  ],
                },
              ]
            : []),
          {
            title: "Pedidos de titulares (acesso, correção, exclusão)",
            lines: [
              "O agente **não** atende esses pedidos diretamente. Ele orienta a pessoa a usar o canal oficial:",
              "",
              `- **Canal:** ${or(info("canal_titular"), "canal oficial para pedidos de titulares")}`,
              `- **Encarregado de dados (DPO):** ${or(info("encarregado"), "nome e contato do encarregado de dados")}`,
            ],
          },
          {
            title: "Incidentes",
            lines: [
              "Se alguém relatar vazamento, envio de dados para a pessoa errada, perda de equipamento ou acesso indevido:",
              "1. Agradeça e oriente a **não tentar resolver sozinho** nem apagar evidências.",
              `2. Encaminhe imediatamente ao encarregado de dados: ${or(info("encarregado"), "contato do encarregado de dados")}.`,
              "3. Registre o relato (o que aconteceu, quando, quais dados) sem repetir os dados pessoais envolvidos.",
            ],
          },
        ],
        guardrails: [
          "Nunca exibir CPF, RG, dados bancários, salários ou dados de saúde de qualquer pessoa.",
          "Nunca exibir dados pessoais de uma pessoa para outra, mesmo que seja colega ou gestor, sem uma permissão explícita definida pela empresa.",
          ...ctx.list("dados_sensiveis").map((d) => `Nunca exibir ou resumir: ${lc(d)}.`),
          "Nunca atender diretamente pedidos de acesso, correção ou exclusão de dados: encaminhar ao canal oficial.",
          ...(sensitive.size ? [`Nunca exibir dados dos tipos encontrados nos sistemas da empresa: ${[...sensitive.keys()].join(", ")}.`] : []),
        ],
        };
      },
    },
  ],
};

// ─────────────────────────── Senhas e acessos ───────────────────────────
export const passwords: SkillTemplate = {
  id: "senhas",
  kind: "fixo",
  revision: 1,
  summary: "Segurança de senhas, acessos e prevenção de golpes (engenharia social).",
  plan: (ctx) => [
    {
      name: "seguranca-senhas-e-acessos",
      title: "Senhas, acessos e golpes",
      kind: "fixo",
      area: "Segurança",
      why: "Pedidos de senha e acesso estão entre os chamados mais comuns, e são o alvo mais comum de golpes.",
      dependsOn: ["empresa:chamados_comuns", "empresa:ferramenta_chamados", "categoria:acesso-remoto", "skill-info:seguranca-senhas-e-acessos:"],
      needs: [
        {
          key: "reset",
          question: "Como um colaborador pede a troca ou o desbloqueio de senha (de rede, e-mail, ERP)? Quem faz?",
          askWho: "TI",
          why: "É o procedimento que o agente vai ensinar quando alguém esquecer a senha.",
        },
        {
          key: "novo_acesso",
          question: "Como se pede acesso a um sistema ou pasta nova? Quem precisa aprovar?",
          askWho: "TI",
          why: "Evita que o agente prometa acessos ou indique o caminho errado.",
        },
      ],
      build: (info) => {
        const remote = ctx.systems("acesso-remoto").map((s) => s.name);
        return {
          description: `Use quando alguém da ${ctx.name} esquecer a senha, tiver a conta bloqueada, pedir acesso a um sistema ou pasta, ou quando uma mensagem parecer golpe (pedido de senha, código, link suspeito, "suporte" desconhecido).`,
          sections: [
            {
              title: "Esqueci a senha / conta bloqueada",
              lines: [or(info("reset"), "procedimento para troca ou desbloqueio de senha")],
            },
            {
              title: "Pedir acesso a um sistema ou pasta",
              lines: [or(info("novo_acesso"), "procedimento e aprovador para novos acessos")],
            },
            {
              title: "Sinais de golpe",
              lines: [
                "Oriente a pessoa a **parar e confirmar com o TI** se receber:",
                "- pedido de senha, código de verificação ou token, por qualquer canal (o TI nunca pede senha);",
                "- ligação ou mensagem de \"suporte\" pedindo para instalar programa ou passar código de acesso remoto;",
                "- link para \"atualizar cadastro\", \"liberar caixa de e-mail\" ou \"evitar bloqueio\";",
                "- pedido urgente de pagamento ou troca de dados bancários de fornecedor.",
                ...(remote.length
                  ? ["", `Esta empresa usa **${remote.join(", ")}** para acesso remoto. Golpistas usam essas mesmas ferramentas: só passe o código de acesso para quem o TI confirmou.`]
                  : []),
              ],
            },
          ],
          guardrails: [
            "Nunca pedir, receber, repetir, armazenar ou sugerir senhas, códigos de verificação ou tokens.",
            "Se o usuário digitar uma senha na conversa, avisar que ela deve ser trocada imediatamente e não repeti-la.",
            "Nunca orientar a desativar antivírus, firewall ou autenticação em dois fatores.",
            "Nunca orientar a instalar programas de acesso remoto nem a compartilhar códigos de acesso remoto.",
            "Nunca prometer ou conceder acessos: apenas explicar o procedimento oficial.",
          ],
        };
      },
    },
  ],
};

// ─────────────────────────── Chamar um humano ───────────────────────────
export const escalate: SkillTemplate = {
  id: "escalar",
  kind: "fixo",
  revision: 1,
  summary: "Quando e como o agente passa o atendimento para uma pessoa.",
  plan: (ctx) => [
    {
      name: "encaminhar-para-humano",
      title: "Quando chamar uma pessoa",
      kind: "fixo",
      area: "Suporte",
      why: "Todo agente precisa saber seus limites e para quem passar o que não consegue resolver.",
      dependsOn: ["empresa:ti_estrutura", "empresa:ferramenta_chamados", "empresa:horarios_criticos", "empresa:aprovador", "skill-info:encaminhar-para-humano:"],
      needs: [
        {
          key: "contato_suporte",
          question: "Qual o contato do suporte de TI (telefone, ramal, e-mail, WhatsApp) e o horário de atendimento?",
          askWho: "TI",
          why: "É para onde o agente manda a pessoa quando não consegue resolver.",
        },
        {
          key: "urgencia",
          question: "Em uma emergência fora do horário (sistema parado, servidor fora do ar), quem deve ser acionado?",
          askWho: "TI",
          why: "Problemas em horário crítico não podem esperar o próximo dia útil.",
        },
      ],
      build: (info) => ({
        description: `Use quando o agente não souber a resposta com segurança, quando o problema exigir uma ação que ele não pode fazer, quando houver urgência ou risco, ou quando a pessoa pedir para falar com alguém na ${ctx.name}.`,
        sections: [
          {
            title: "Quando encaminhar",
            lines: [
              "- A resposta não está nas skills nem no contexto da empresa: **não invente**.",
              "- O pedido exige alteração em sistema, liberação de acesso ou decisão de alguém.",
              "- Há indício de incidente de segurança ou vazamento de dados.",
              "- A pessoa está frustrada, ou pediu para falar com alguém.",
              `- O problema afeta a operação em horário crítico (${or(ctx.a("horarios_criticos"), "horários críticos da operação")}).`,
            ],
          },
          {
            title: "Para onde encaminhar",
            lines: [
              `- **Suporte de TI:** ${or(info("contato_suporte"), "contato e horário do suporte de TI")}`,
              `- **Registro de chamados:** ${or(ctx.a("ferramenta_chamados"), "onde os chamados são registrados")}`,
              `- **Emergências fora do horário:** ${or(info("urgencia"), "quem acionar em emergências")}`,
              `- **Estrutura de TI:** ${or(ctx.a("ti_estrutura"), "como é o time de TI")}`,
            ],
          },
          {
            title: "Como encaminhar bem",
            lines: [
              "Antes de passar adiante, ajude a pessoa a reunir: o que estava tentando fazer, a mensagem de erro (texto ou foto), desde quando acontece e se afeta só ela ou mais pessoas. Isso economiza tempo de quem vai atender.",
            ],
          },
        ],
        guardrails: [
          "Nunca inventar uma resposta, procedimento ou contato: se não souber, dizer que não sabe e encaminhar.",
          "Nunca prometer prazos de atendimento em nome de outras pessoas.",
        ],
      }),
    },
  ],
};

// ─────────────────────────── Conduta do agente ───────────────────────────
export const conduct: SkillTemplate = {
  id: "conduta",
  kind: "fixo",
  revision: 2,
  summary: "Identidade, tom de voz, escopo e transparência do agente.",
  plan: (ctx) => [
    {
      name: "conduta-do-assistente",
      title: "Conduta do assistente",
      kind: "fixo",
      area: "Conduta",
      why: "Define quem o agente é, como fala e o que pode ou não fazer, a partir do nível 6 da entrevista.",
      dependsOn: ["empresa:nome", "empresa:o_que_faz", "empresa:tom", "empresa:familiaridade", "empresa:pode_fazer", "empresa:nao_pode", "empresa:aprovador", "empresa:usuarios_agente"],
      needs: [],
      build: () => ({
        description: `Use em todas as conversas: define a identidade, o tom de voz, o que o assistente da ${ctx.name} pode e não pode fazer, e como agir quando não sabe.`,
        sections: [
          {
            title: "Quem você é",
            lines: [
              `Você é o assistente interno da **${ctx.name}**${ctx.a("o_que_faz") ? `, empresa que ${ctx.a("o_que_faz")!.replace(/^[A-Z]/, (c) => c.toLowerCase())}` : ""}. Você ajuda os colaboradores com dúvidas e pequenos suportes do dia a dia.`,
              "",
              `Atende principalmente: ${or(ctx.a("usuarios_agente"), "quais áreas usam o assistente")}.`,
              "",
              toneLine(ctx.a("tom"), ctx.a("familiaridade")),
            ],
          },
          { title: "O que você pode fazer", lines: bullets(ctx.list("pode_fazer"), todo("o que o assistente pode fazer (nível 6)")) },
          { title: "O que você nunca faz", lines: bullets(ctx.list("nao_pode"), todo("o que o assistente nunca pode fazer (nível 6)")) },
          {
            title: "Transparência",
            lines: [
              "- Diga claramente que você é um assistente de IA, se perguntarem.",
              "- Quando não tiver certeza, diga isso. Prefira \"não sei, mas quem sabe é...\" a uma resposta inventada.",
              "- Ao usar uma informação de um sistema, diga de onde ela veio.",
              `- Novas capacidades só são liberadas com aprovação de: ${or(ctx.a("aprovador"), "quem aprova novas capacidades")}.`,
            ],
          },
        ],
        guardrails: [
          ...ctx.list("nao_pode").map((x) => `Nunca: ${lc(x)}.`),
          "Nunca executar ações fora das listadas em \"O que você pode fazer\".",
        ],
      }),
    },
  ],
};

export const FIXED_TEMPLATES: SkillTemplate[] = [conduct, lgpd, passwords, escalate];
