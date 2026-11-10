/**
 * Roteiro da entrevista de negócio, do BÁSICO ao COMPLEXO.
 *
 * Cada nível existe porque embasa decisões concretas do produto (campo `informs`).
 * Isso garante que o MCP gerado reflita como a empresa realmente funciona,
 * e não só o que o scan técnico encontrou.
 */

export type QuestionType = "text" | "number" | "choice" | "multi" | "list";

export interface InterviewQuestion {
  id: string;
  prompt: string;
  type: QuestionType;
  required?: boolean;
  options?: string[];
  help?: string;
  /** Quem costuma saber responder, caso o entrevistado não saiba. */
  askWho?: string;
  /** Mostra a pergunta só se a condição for verdadeira. */
  showIf?: (answers: Record<string, unknown>) => boolean;
}

export interface InterviewLevel {
  level: number;
  title: string;
  /** Por que este nível vem nesta ordem. */
  why: string;
  /** Quais decisões do produto estas respostas embasam. */
  informs: string[];
  questions: InterviewQuestion[];
}

const has = (answers: Record<string, unknown>, id: string, value: string) => {
  const v = answers[id];
  return Array.isArray(v) ? v.includes(value) : v === value;
};

export const LEVELS: InterviewLevel[] = [
  {
    level: 1,
    title: "Identidade e ramo de atuação",
    why: "Antes de qualquer coisa, o agente precisa saber de que empresa está falando e em que mundo ela vive.",
    informs: ["Vocabulário e glossário do agente", "Tom de voz", "Quais tipos de sistema esperar na análise técnica"],
    questions: [
      {
        id: "ramo",
        prompt: "Qual o ramo de atuação principal?",
        type: "choice",
        required: true,
        options: [
          "Alimentação / food service",
          "Indústria",
          "Varejo",
          "Atacado / distribuição",
          "Serviços",
          "Saúde",
          "Educação",
          "Tecnologia",
          "Logística / transporte",
          "Agronegócio",
          "Construção",
          "Outro",
        ],
      },
      {
        id: "segmento",
        prompt: "Descreva o segmento com mais precisão.",
        type: "text",
        required: true,
        help: "Ex.: refeições coletivas para empresas, panificação industrial, rede de restaurantes self-service.",
      },
      {
        id: "o_que_faz",
        prompt: "Em uma ou duas frases: o que a empresa faz e para quem?",
        type: "text",
        required: true,
      },
      {
        id: "colaboradores",
        prompt: "Quantos colaboradores, aproximadamente?",
        type: "choice",
        required: true,
        options: ["Até 50", "51 a 200", "201 a 500", "501 a 1.000", "1.001 a 5.000", "Mais de 5.000"],
      },
      { id: "sede", prompt: "Onde fica a sede (cidade/UF)?", type: "text", required: true },
      {
        id: "regioes",
        prompt: "Em quais cidades/estados a empresa opera?",
        type: "text",
        help: "Ex.: só Grande SP; SP, RJ e MG; nacional.",
      },
    ],
  },
  {
    level: 2,
    title: "Como a empresa atua",
    why: "Saber como o dinheiro entra e como a operação flui define quais sistemas são críticos e quando não se pode errar.",
    informs: [
      "Quais sistemas o agente deve priorizar",
      "Janelas de horário críticas (guardrails de disponibilidade)",
      "Quais integrações mapear primeiro",
    ],
    questions: [
      {
        id: "modelo",
        prompt: "Qual o modelo de negócio?",
        type: "choice",
        required: true,
        options: ["B2B (vende para empresas)", "B2C (vende para consumidor final)", "Ambos", "Governo / licitações", "Outro"],
      },
      { id: "clientes", prompt: "Quem são os clientes típicos?", type: "text", required: true },
      {
        id: "canais",
        prompt: "Por quais canais a empresa vende ou entrega?",
        type: "multi",
        required: true,
        options: [
          "Lojas / restaurantes próprios",
          "Franquias",
          "Delivery / apps (iFood etc.)",
          "E-commerce próprio",
          "Contratos corporativos (unidades em clientes)",
          "Representantes / venda direta",
          "Atacado / distribuidores",
          "Outro",
        ],
      },
      {
        id: "apps_delivery",
        prompt: "Quais apps/plataformas de delivery?",
        type: "text",
        showIf: (a) => has(a, "canais", "Delivery / apps (iFood etc.)"),
      },
      {
        id: "unidades_tipos",
        prompt: "Que tipos de unidade existem?",
        type: "multi",
        required: true,
        options: [
          "Escritório / sede administrativa",
          "Fábrica / cozinha central",
          "Centro de distribuição / estoque",
          "Lojas / pontos de venda",
          "Unidades dentro de clientes",
          "Trabalho remoto",
          "Outro",
        ],
      },
      { id: "unidades_qtd", prompt: "Quantas unidades/locais no total, aproximadamente?", type: "number", required: true },
      {
        id: "cadeia_valor",
        prompt: "Descreva o fluxo principal do negócio, do pedido/compra até a entrega e o faturamento.",
        type: "text",
        required: true,
        help: "Ex.: cliente fecha contrato → nutricionista monta cardápio → compras → cozinha produz → entrega na unidade → faturamento mensal.",
      },
      {
        id: "horarios_criticos",
        prompt: "Quais dias/horários são críticos (quando um sistema parado é inaceitável)?",
        type: "text",
        required: true,
      },
      { id: "sazonalidade", prompt: "Existe sazonalidade relevante (meses de pico, datas especiais)?", type: "text" },
    ],
  },
  {
    level: 3,
    title: "Estrutura e pessoas",
    why: "O agente vai atender pessoas. Precisamos saber quem são, de que áreas, e que familiaridade têm com tecnologia.",
    informs: ["Perfis de acesso e permissões", "Linguagem das respostas", "Ordem de implantação por área", "Obrigações regulatórias"],
    questions: [
      {
        id: "areas",
        prompt: "Quais são as áreas/departamentos? (separe por ;)",
        type: "list",
        required: true,
        help: "Ex.: Operações; Compras; Financeiro; RH; Comercial; Nutrição; TI",
      },
      {
        id: "usuarios_agente",
        prompt: "Quais áreas ou perfis vão usar o agente primeiro? (separe por ;)",
        type: "list",
        required: true,
      },
      {
        id: "familiaridade",
        prompt: "Familiaridade média desses usuários com tecnologia:",
        type: "choice",
        required: true,
        options: ["Baixa (precisam de passo a passo)", "Média", "Alta"],
      },
      {
        id: "ti_estrutura",
        prompt: "Como é o time de TI? (pessoas internas, terceiros, empresas parceiras)",
        type: "text",
        required: true,
        askWho: "TI",
      },
      {
        id: "regulacoes",
        prompt: "Quais regulações afetam a operação?",
        type: "multi",
        options: [
          "LGPD",
          "Vigilância sanitária / ANVISA",
          "Fiscal (NF-e, SPED)",
          "Trabalhista (eSocial, ponto)",
          "PCI (cartões de pagamento)",
          "ISO / certificações",
          "Outro",
        ],
        askWho: "Jurídico / Qualidade",
      },
    ],
  },
  {
    level: 4,
    title: "Processos-chave e dúvidas do dia a dia",
    why: "As skills do agente nascem daqui: processos que as pessoas executam e dúvidas que mais se repetem.",
    informs: ["Lista de skills do agente", "Base de conhecimento (FAQ)", "Quais ações automatizar primeiro"],
    questions: [
      {
        id: "processos",
        prompt: "Quais são os processos mais importantes do dia a dia? (5 a 10, separe por ;)",
        type: "list",
        required: true,
      },
      {
        id: "duvidas_frequentes",
        prompt: "Quais dúvidas os colaboradores mais levam ao TI ou aos colegas? (separe por ;)",
        type: "list",
        required: true,
      },
      {
        id: "chamados_comuns",
        prompt: "Quais os chamados de suporte mais comuns? (separe por ;)",
        type: "list",
        required: true,
        help: "Ex.: reset de senha; impressora; acesso ao ERP; VPN; e-mail cheio",
        askWho: "TI",
      },
      {
        id: "ferramenta_chamados",
        prompt: "Onde os chamados são registrados hoje?",
        type: "text",
        help: "Ex.: GLPI, e-mail, WhatsApp, planilha, nenhum.",
        askWho: "TI",
      },
      {
        id: "documentacao",
        prompt: "Existem manuais, POPs ou base de conhecimento? Onde ficam?",
        type: "text",
      },
    ],
  },
  {
    level: 5,
    title: "Sistemas e dados (visão do negócio)",
    why: "Antes de analisar os computadores, perguntamos o que as pessoas USAM. A análise depois confirma, detalha e encontra o que ninguém lembrou.",
    informs: ["Onde a análise técnica deve olhar primeiro", "Fontes da verdade de cada dado", "Conectores do MCP"],
    questions: [
      { id: "erp", prompt: "Qual o ERP ou sistema de gestão principal?", type: "text", required: true },
      {
        id: "migracoes",
        prompt: "Há sistemas em migração ou desativação? (qual substitui qual, e prazo)",
        type: "text",
        required: true,
        help: "Importante: o agente não pode mandar ninguém para o sistema que está sendo desligado.",
      },
      {
        id: "outros_sistemas",
        prompt: "Outros sistemas usados (PDV, fiscal, RH/folha, ponto, BI, CRM, e-mail...)? (separe por ;)",
        type: "list",
        required: true,
      },
      {
        id: "hospedagem",
        prompt: "Onde os sistemas rodam?",
        type: "choice",
        required: true,
        options: ["Tudo local (servidores próprios)", "Tudo em nuvem / SaaS", "Híbrido", "Não sei"],
        askWho: "TI",
      },
      {
        id: "fontes_verdade",
        prompt: "Para pedidos, estoque, funcionários e clientes: qual sistema é a fonte da verdade de cada um?",
        type: "text",
        askWho: "TI",
      },
      { id: "integracoes", prompt: "Quais sistemas trocam dados entre si, e como?", type: "text", askWho: "TI" },
    ],
  },
  {
    level: 6,
    title: "O agente: objetivos e limites",
    why: "Por último, com o contexto completo, definimos o que o agente deve e não deve fazer.",
    informs: ["Guardrails", "Escopo das tools (leitura x escrita)", "Fluxo de aprovação", "Canal de atendimento"],
    questions: [
      { id: "objetivo", prompt: "O que seria um sucesso para o agente nos primeiros 3 meses?", type: "text", required: true },
      {
        id: "pode_fazer",
        prompt: "O que o agente PODE fazer? (separe por ;)",
        type: "list",
        required: true,
        help: "Ex.: explicar procedimentos; consultar status de pedido; abrir chamado; consultar estoque",
      },
      { id: "nao_pode", prompt: "O que o agente NUNCA pode fazer ou acessar? (separe por ;)", type: "list", required: true },
      {
        id: "dados_sensiveis",
        prompt: "Quais dados são sensíveis? (separe por ;)",
        type: "list",
        required: true,
        help: "Ex.: salários; dados pessoais de clientes; financeiro; receitas/fichas técnicas",
      },
      { id: "aprovador", prompt: "Quem aprova novas capacidades do agente?", type: "text", required: true },
      {
        id: "canal",
        prompt: "Por onde os colaboradores vão falar com o agente?",
        type: "multi",
        required: true,
        options: ["Microsoft Teams", "WhatsApp", "Slack", "Página web / intranet", "Claude (desktop/web)", "Outro"],
      },
      {
        id: "tom",
        prompt: "Tom de voz do agente:",
        type: "choice",
        required: true,
        options: ["Formal", "Cordial e direto", "Descontraído"],
      },
    ],
  },
];

/** Níveis mínimos de negócio exigidos antes de rodar coletores técnicos. */
export const MIN_LEVEL_FOR_TECH_SCAN = 2;

export function allQuestions(): InterviewQuestion[] {
  return LEVELS.flatMap((l) => l.questions);
}

export function findQuestion(id: string): InterviewQuestion | undefined {
  return allQuestions().find((q) => q.id === id);
}
