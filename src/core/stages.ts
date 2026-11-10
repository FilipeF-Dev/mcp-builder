import type { Workspace } from "./workspace.js";
import { completedUpTo, levelStatus } from "../company/progress.js";
import { LEVELS, MIN_LEVEL_FOR_TECH_SCAN } from "../company/levels.js";

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
      what: "A ferramenta examina computadores e servidores (só lê, nunca altera nada) e reconhece os sistemas da empresa.",
      why: `Só começa depois dos níveis 1 a ${MIN_LEVEL_FOR_TECH_SCAN} da entrevista, para que o que for encontrado possa ser interpretado.`,
      you: "Rodar a análise em cada servidor e em computadores típicos de cada área.",
      state: s2,
      progress: `${inv.hosts.length} máquina(s) analisada(s)`,
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
      what: "Com tudo entendido, a IA escreve o contexto, as habilidades (skills) e as regras de segurança (guardrails) do agente.",
      why: "Só agora existe informação suficiente e confirmada para o agente ser útil e seguro.",
      you: "Nada: esta etapa é automática.",
      state: "em-breve",
      progress: "disponível em uma próxima versão",
    },
    {
      number: 5,
      title: "Revisar e entregar",
      what: "Um relatório para o TI aprovar item por item, e o servidor MCP pronto para conectar ao agente.",
      why: "Nada vai para produção sem aprovação de uma pessoa.",
      you: "Revisar e aprovar.",
      state: "em-breve",
      progress: "disponível em uma próxima versão",
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
