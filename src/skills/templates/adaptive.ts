/**
 * MODELOS ADAPTÁVEIS: nascem da interpretação do ambiente.
 * Cada um decide SE se aplica, olhando a entrevista e a análise técnica juntas.
 */
import type { SkillPlan, SkillTemplate } from "../types.js";
import type { SkillContext } from "../context.js";
import { bullets, or, skillName, todo } from "./helpers.js";

const NO = /^(n[aã]o|nenhum|nenhuma|-|n\/a)\b/i;

// ─────────────────────────── Sistemas de gestão (um por ERP/PDV) ───────────────────────────

interface BusinessSystem {
  name: string;
  signatureId?: string;
  hosts: string[];
  /** De onde soubemos: entrevista, análise ou ambos. */
  source: string;
}

/** Junta o que a entrevista disse (pergunta "erp") com o que a análise encontrou (categorias erp/pdv). */
function businessSystems(ctx: SkillContext): BusinessSystem[] {
  const found = [...ctx.systems("erp"), ...ctx.systems("pdv")];
  const out: BusinessSystem[] = found.map((s) => ({
    name: s.name,
    signatureId: s.signatureId,
    hosts: s.hosts,
    source: ctx.mentions("erp", s.name) || ctx.mentions("migracoes", s.name) ? "entrevista e análise técnica" : "análise técnica",
  }));
  const said = ctx.a("erp");
  if (said && !NO.test(said) && !found.some((s) => ctx.mentions("erp", s.name))) {
    out.push({ name: said, hosts: [], source: "entrevista" });
  }
  return out;
}

export const businessSystem: SkillTemplate = {
  id: "sistema-de-gestao",
  kind: "adaptavel",
  revision: 2,
  summary: "Uma skill para cada ERP/PDV citado na entrevista ou encontrado na análise.",
  plan: (ctx) =>
    businessSystems(ctx).map((sys): SkillPlan => {
      const name = skillName("sistema", sys.name);
      const inMigration = ctx.mentions("migracoes", sys.name);
      return {
        name,
        title: `Sistema ${sys.name}`,
        kind: "adaptavel",
        area: "Sistemas",
        why: `${sys.name} foi identificado pela ${sys.source}${sys.hosts.length ? ` (em ${sys.hosts.join(", ")})` : ""}.`,
        dependsOn: [
          sys.signatureId ? `sistema:${sys.signatureId}` : "empresa:erp",
          "empresa:erp",
          "empresa:migracoes",
          "empresa:processos",
          `skill-info:${name}:`,
        ],
        needs: [
          { key: "uso", question: `Para que a empresa usa o ${sys.name}? Quais módulos ou rotinas (compras, estoque, fiscal, vendas...) e quais áreas?`, askWho: "TI / usuários-chave", why: "Define sobre o que o agente pode orientar." },
          { key: "acesso", question: `Como um colaborador acessa o ${sys.name} (endereço, atalho, aplicativo) e quem cria o usuário?`, askWho: "TI", why: "É a dúvida mais comum sobre qualquer sistema." },
          { key: "suporte", question: `Quando o ${sys.name} apresenta erro, quem deve ser acionado: o TI interno ou o suporte do fornecedor? Com qual contato?`, askWho: "TI", why: "Evita chamados parados no lugar errado." },
          ...(inMigration
            ? [{ key: "situacao", question: `Qual a situação do ${sys.name} na migração: ainda é o sistema oficial, está em implantação ou já foi desativado? Para quais rotinas?`, askWho: "TI", why: "O agente não pode mandar ninguém para o sistema errado." }]
            : []),
        ],
        build: (info) => ({
          description: `Use quando alguém da ${ctx.name} tiver dúvidas sobre o sistema ${sys.name}: como acessar, para que serve, rotinas, erros ou a quem recorrer.`,
          sections: [
            ...(inMigration
              ? [{ title: "⚠ Sistema em migração", lines: [`A empresa informou: _"${ctx.a("migracoes")}"_`, "", `**Situação atual do ${sys.name}:** ${or(info("situacao"), "situação do sistema na migração")}`, "", "Antes de orientar qualquer rotina, confirme se ela já foi migrada."] }]
              : []),
            { title: "Para que serve", lines: [or(info("uso"), `para que a empresa usa o ${sys.name}`)] },
            { title: "Como acessar", lines: [or(info("acesso"), `como acessar o ${sys.name} e quem cria usuários`)] },
            { title: "Processos relacionados", lines: ["Processos citados na entrevista que podem envolver este sistema:", "", ...bullets(ctx.list("processos"))] },
            { title: "Quando der erro", lines: [`- **Quem acionar:** ${or(info("suporte"), `suporte do ${sys.name}`)}`, "- Peça à pessoa: a tela e a mensagem de erro, o que estava fazendo e se afeta outras pessoas.", "- Para encaminhar, siga a skill **encaminhar-para-humano**."] },
            ...(sys.hosts.length ? [{ title: "Onde roda (para o TI)", lines: bullets(sys.hosts) }] : []),
          ],
          guardrails: [
            `Nunca alterar, excluir ou lançar dados no ${sys.name}: apenas orientar ou consultar por ferramentas aprovadas.`,
            ...(inMigration ? [`Nunca orientar uma rotina no ${sys.name} sem antes confirmar a situação atual dele na migração.`] : []),
          ],
        }),
      };
    }),
};

// ─────────────────────────── Migração de sistemas ───────────────────────────
export const migration: SkillTemplate = {
  id: "migracao",
  kind: "adaptavel",
  revision: 1,
  summary: "Orienta os colaboradores durante uma troca de sistema citada na entrevista.",
  plan: (ctx) => {
    const m = ctx.a("migracoes");
    if (!m || NO.test(m)) return [];
    const name = "migracao-de-sistemas";
    return [
      {
        name,
        title: "Migração de sistemas",
        kind: "adaptavel",
        area: "Sistemas",
        why: `A entrevista informou uma migração em andamento: "${m}".`,
        dependsOn: ["empresa:migracoes", "categoria:erp", `skill-info:${name}:`],
        needs: [
          { key: "cronograma", question: "Quais rotinas já estão no sistema novo, quais ainda estão no antigo, e quais as próximas datas?", askWho: "TI", why: "É a informação que mais muda durante uma migração." },
          { key: "problemas", question: "Onde os colaboradores devem relatar problemas ou dúvidas sobre o sistema novo?", askWho: "TI", why: "Evita que dúvidas da migração se percam." },
          { key: "material", question: "Existe treinamento, manual ou vídeo do sistema novo? Onde fica?", askWho: "TI / RH", why: "O agente pode indicar o material em vez de explicar do zero." },
        ],
        build: (info) => ({
          description: `Use quando alguém da ${ctx.name} estiver em dúvida sobre qual sistema usar durante a migração, ou tiver dificuldades com o sistema novo.`,
          sections: [
            { title: "O que está mudando", lines: [`_"${m}"_`] },
            { title: "Qual sistema usar para cada rotina", lines: [or(info("cronograma"), "cronograma da migração: rotinas já migradas e próximas datas")] },
            { title: "Problemas com o sistema novo", lines: [or(info("problemas"), "onde relatar problemas do sistema novo")] },
            { title: "Material de apoio", lines: [or(info("material"), "treinamento ou manual do sistema novo")] },
          ],
          guardrails: ["Nunca orientar uma rotina no sistema antigo sem confirmar que ela ainda não foi migrada."],
        }),
      },
    ];
  },
};

// ─────────────────────────── E-mail ───────────────────────────
export const email: SkillTemplate = {
  id: "email",
  kind: "adaptavel",
  revision: 1,
  summary: "Dúvidas e problemas de e-mail, adaptados ao serviço de e-mail da empresa.",
  plan: (ctx) => {
    const servers = ctx.systems("email").map((s) => s.name);
    const mentioned = /e-?mail|outlook|gmail|exchange|microsoft 365|office 365|google workspace/i.test(ctx.a("outros_sistemas") ?? "");
    if (!servers.length && !mentioned) return [];
    const name = "email";
    const provider = servers.length ? servers.join(", ") : undefined;
    return [
      {
        name,
        title: "E-mail",
        kind: "adaptavel",
        area: "Suporte",
        why: servers.length ? `Servidor de e-mail encontrado na análise: ${provider}.` : "A entrevista citou e-mail entre os sistemas usados.",
        dependsOn: ["categoria:email", "empresa:outros_sistemas", `skill-info:${name}:`],
        needs: [
          ...(servers.length ? [] : [{ key: "provedor", question: "Qual serviço de e-mail a empresa usa (Microsoft 365, Google Workspace, servidor próprio, provedor da hospedagem)?", askWho: "TI", why: "Os procedimentos mudam completamente conforme o serviço." }]),
          { key: "acesso", question: "Como acessar o e-mail fora da empresa ou pelo celular (webmail, aplicativo)?", askWho: "TI", why: "Dúvida frequente de quem trabalha em campo." },
          { key: "caixa_cheia", question: "O que o colaborador deve fazer quando a caixa de e-mail fica cheia?", askWho: "TI", why: "Problema recorrente, com solução simples quando documentada." },
          { key: "nova_conta", question: "Como se pede um e-mail novo ou uma lista/grupo de e-mail?", askWho: "TI", why: "Evita pedidos pelo canal errado." },
        ],
        build: (info) => ({
          description: `Use quando alguém da ${ctx.name} tiver dúvida ou problema com e-mail: acesso, caixa cheia, e-mail novo, mensagens suspeitas.`,
          sections: [
            { title: "Serviço de e-mail da empresa", lines: [provider ?? or(info("provedor"), "qual serviço de e-mail a empresa usa")] },
            { title: "Acessar de fora ou pelo celular", lines: [or(info("acesso"), "como acessar o e-mail fora da empresa")] },
            { title: "Caixa cheia", lines: [or(info("caixa_cheia"), "o que fazer quando a caixa enche")] },
            { title: "E-mail novo ou grupo", lines: [or(info("nova_conta"), "como pedir e-mail novo ou grupo")] },
            { title: "Mensagem suspeita", lines: ["Não clique em links nem abra anexos. Siga a skill **seguranca-senhas-e-acessos** e avise o TI."] },
          ],
          guardrails: ["Nunca ler, resumir ou encaminhar e-mails de outras pessoas."],
        }),
      },
    ];
  },
};

// ─────────────────────────── Chamados ───────────────────────────
export const tickets: SkillTemplate = {
  id: "chamados",
  kind: "adaptavel",
  revision: 1,
  summary: "Como abrir um chamado, com triagem dos chamados mais comuns da empresa.",
  plan: (ctx) => {
    const tool = ctx.a("ferramenta_chamados");
    const glpi = ctx.systems().find((s) => s.signatureId === "glpi");
    const common = ctx.list("chamados_comuns");
    if ((!tool || NO.test(tool)) && !glpi && !common.length) return [];
    const name = "abrir-chamado";
    return [
      {
        name,
        title: "Abrir um chamado",
        kind: "adaptavel",
        area: "Suporte",
        why: [tool && `Chamados registrados em: ${tool}.`, glpi && "GLPI encontrado na análise.", common.length && `${common.length} tipo(s) de chamado comum citados.`].filter(Boolean).join(" "),
        dependsOn: ["empresa:ferramenta_chamados", "empresa:chamados_comuns", "sistema:glpi", `skill-info:${name}:`],
        needs: [
          { key: "como", question: "Passo a passo para abrir um chamado (endereço, aplicativo, e-mail ou número)?", askWho: "TI", why: "É o que o agente vai ensinar." },
          { key: "urgencia", question: "Como o colaborador indica que um chamado é urgente, e o que conta como urgente?", askWho: "TI", why: "Ajuda a priorizar sem sobrecarregar o TI." },
        ],
        build: (info) => ({
          description: `Use quando alguém da ${ctx.name} precisar registrar um problema ou pedido para o TI, ou quando o assistente não conseguir resolver e precisar encaminhar.`,
          sections: [
            { title: "Onde e como abrir", lines: [`**Ferramenta:** ${or(tool ?? (glpi ? "GLPI" : undefined), "onde os chamados são registrados")}`, "", or(info("como"), "passo a passo para abrir um chamado")] },
            { title: "Urgência", lines: [or(info("urgencia"), "como indicar e o que conta como urgente")] },
            {
              title: "Chamados mais comuns: o que pedir antes de abrir",
              lines: common.length
                ? common.flatMap((c) => [`- **${c}**: peça a descrição do problema, desde quando acontece, em qual computador/sistema e, se houver, a mensagem de erro.`])
                : [todo("quais os chamados mais comuns (nível 4)")],
            },
          ],
          guardrails: ["Nunca fechar, alterar ou priorizar chamados em nome do TI."],
        }),
      },
    ];
  },
};

// ─────────────────────────── Dúvidas frequentes ───────────────────────────
export const faq: SkillTemplate = {
  id: "duvidas-frequentes",
  kind: "adaptavel",
  revision: 1,
  summary: "Responde as dúvidas mais frequentes citadas na entrevista, uma a uma.",
  plan: (ctx) => {
    const items = ctx.list("duvidas_frequentes");
    if (!items.length) return [];
    const name = "duvidas-frequentes";
    const keyOf = (q: string) => skillName(q).slice(0, 40);
    return [
      {
        name,
        title: "Dúvidas frequentes",
        kind: "adaptavel",
        area: "Suporte",
        why: `A entrevista listou ${items.length} dúvida(s) frequente(s) dos colaboradores.`,
        dependsOn: ["empresa:duvidas_frequentes", `skill-info:${name}:`],
        needs: items.map((q) => ({
          key: keyOf(q),
          question: `Qual a resposta ou o procedimento para a dúvida frequente: "${q}"?`,
          askWho: "Área responsável",
          why: "Cada resposta vira conhecimento direto do agente.",
        })),
        build: (info) => ({
          description: `Use quando alguém da ${ctx.name} fizer uma destas perguntas comuns: ${items.join("; ")}.`,
          sections: items.map((q) => ({ title: q, lines: [or(info(keyOf(q)), `resposta para "${q}"`)] })),
          guardrails: [],
        }),
      },
    ];
  },
};

export const ADAPTIVE_TEMPLATES: SkillTemplate[] = [businessSystem, migration, email, tickets, faq];
