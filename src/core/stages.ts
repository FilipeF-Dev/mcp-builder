import type { Workspace } from "./workspace.js";
import { completedUpTo, levelStatus } from "../company/progress.js";
import { LEVELS, MIN_LEVEL_FOR_TECH_SCAN } from "../company/levels.js";
import { SKILLS_DIR, loadContext, missingInfo, planSkills, skillsEnabled } from "../skills/index.js";
import { reviewItems, reviewSummary } from "../delivery/approvals.js";
import { serverEnabled } from "../delivery/server.js";

/**
 * As ETAPAS do processo, em linguagem simples.
 *
 * Esta é a fonte única usada pelo menu guiado, pelo comando `status` e pelo relatório.
 * A documentação em docs/02-como-funciona.md descreve as mesmas etapas: mantenha os dois alinhados.
 */

export type StageState = "concluida" | "em-andamento" | "pendente" | "bloqueada" | "em-breve";

export interface StageInfo {
  number: number;
  title: string;
  /** O que acontece nesta etapa, em uma frase. */
  what: string;
  /** Por que ela vem nesta posição. */
  why: string;
  /** O que a pessoa precisa fazer. */
  you: string;
  state: StageState;
  /** Texto curto de progresso (ex.: "3 de 6 níveis"). */
  progress: string;
}

export function computeStages(ws: Workspace): StageInfo[] {
  const company = ws.loadCompany();
  const inv = ws.loadInventory();
  const qs = ws.loadQuestions();
  const done = completedUpTo(company);
  const anyAnswered = levelStatus(company).some((s) => s.answered > 0);
  const open = qs.filter((q) => q.status === "aberta").length;
  const closed = qs.length - open;

  const s1: StageState = done === LEVELS.length ? "concluida" : anyAnswered ? "em-andamento" : "pendente";
  const canScan = done >= MIN_LEVEL_FOR_TECH_SCAN;
  const s2: StageState = !canScan ? "bloqueada" : inv.hosts.length > 0 ? "em-andamento" : "pendente";
  // Etapa 4: skills
  let s4: StageState = "bloqueada";
  let p4 = "liberada quando a entrevista estiver completa";
  if (skillsEnabled(ws)) {
    const built = Object.keys(ws.loadManifest().artifacts).filter((p) => p.startsWith(SKILLS_DIR + "/")).length;
    if (built === 0) {
      s4 = "pendente";
      p4 = "pronta para montar";
    } else {
      const ctx = loadContext(ws);
      const missing = planSkills(ctx).reduce((n, p) => n + missingInfo(ctx, p).length, 0);
      s4 = missing ? "em-andamento" : "concluida";
      p4 = `${built} skill(s) gerada(s)${missing ? `, ${missing} informação(ões) faltando` : ""}`;
    }
  }
  // Etapa 5: revisão e servidor
  let s5: StageState = "bloqueada";
  let p5 = "liberada depois de montar o agente";
  const items = reviewItems(ws);
  if (items.some((i) => i.kind === "skill")) {
    const r = reviewSummary(items);
    const server = serverEnabled(ws);
    s5 = r.approved + r.rejected === 0 ? "pendente" : r.waiting > 0 || !server ? "em-andamento" : "concluida";
    p5 = `${r.approved} aprovado(s), ${r.waiting} aguardando revisão${server ? " · servidor MCP pronto" : ""}`;
  }
  const s3: StageState = qs.length === 0 ? "pendente" : open === 0 ? "concluida" : "em-andamento";

  return [
    {
      number: 1,
      title: "Conhecer o negócio",
      what: "Uma entrevista em 6 níveis, do ramo de atuação até o que o agente pode ou não fazer.",
      why: "Sem entender a empresa, nenhum dado técnico faz sentido. Por isso esta etapa vem primeiro.",
      you: "Responder as perguntas. Se não souber alguma, digite ? e ela vira uma pendência para outra pessoa.",
      state: s1,
      progress: `${done} de ${LEVELS.length} níveis concluídos`,
    },
    {
      number: 2,
      title: "Mapear a tecnologia",
      what: "A ferramenta examina este computador e, com autorização, varre a rede em busca de servidores e serviços e lê a estrutura dos bancos de dados (só lê, nunca altera nada), e reconhece os sistemas da empresa.",
      why: `Só começa depois dos níveis 1 a ${MIN_LEVEL_FOR_TECH_SCAN} da entrevista, para que o que for encontrado possa ser interpretado.`,
      you: "Varrer a rede (com autorização do responsável) e analisar os servidores principais e um computador típico de cada área.",
      state: s2,
      progress: `${inv.hosts.length} máquina(s) analisada(s) · ${inv.network.devices.length} equipamento(s) na rede · ${inv.databases.length} banco(s) lido(s)`,
    },
    {
      number: 3,
      title: "Resolver pendências",
      what: "Tudo que a ferramenta não conseguiu entender sozinha vira uma pergunta para uma pessoa.",
      why: "A ferramenta pergunta em vez de supor. Uma suposição errada vira um agente dando informação errada.",
      you: "Responder ou encaminhar cada pendência para quem sabe (TI, Financeiro, RH...).",
      state: s3,
      progress: `${open} aberta(s), ${closed} resolvida(s)`,
    },
    {
      number: 4,
      title: "Montar o agente",
      what: "Modelos prontos geram as habilidades (skills) e as regras de segurança (guardrails) do agente: algumas fixas, como LGPD, e outras adaptadas ao que foi encontrado na empresa.",
      why: "Só com a entrevista completa existe informação suficiente para o agente ser útil e seguro. O nível 6 define os limites dele.",
      you: "Escolher \"Montar o agente\" e responder as informações que as skills pedirem.",
      state: s4,
      progress: p4,
    },
    {
      number: 5,
      title: "Revisar e entregar",
      what: "O TI revisa cada skill, o perfil da empresa e cada ferramenta. Com o que for aprovado, a ferramenta monta o servidor MCP que conecta o agente (ex.: Claude) à empresa.",
      why: "Nada vai para produção sem aprovação de uma pessoa. Se algo mudar depois, só o que mudou precisa de nova revisão.",
      you: "Escolher \"Revisar e aprovar\" e depois seguir o LEIA-ME do servidor (instalar e conectar ao Claude).",
      state: s5,
      progress: p5,
    },
  ];
}

export const STATE_LABEL: Record<StageState, string> = {
  concluida: "Concluída",
  "em-andamento": "Em andamento",
  pendente: "A fazer",
  bloqueada: "Aguardando etapa anterior",
  "em-breve": "Em breve",
};
