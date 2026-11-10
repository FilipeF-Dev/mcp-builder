import type { Change, Host, Question } from "./schema.js";
import { diffFacts, hostFacts, type FactDiff } from "./facts.js";

type NewChange = Omit<Change, "id" | "at">;
type NewQuestion = Omit<Question, "id" | "status" | "createdAt">;

/** Nome legível de cada tipo de fato (o 3º segmento da chave host:<id>:<area>:...). */
const AREA_LABEL: Record<string, string> = {
  sistema: "sistema reconhecido",
  programa: "programa",
  servico: "serviço",
  porta: "porta de rede",
  tarefa: "tarefa agendada",
  odbc: "conexão ODBC",
  rede: "endereço de rede",
  papel: "papel da máquina",
  "sistema-operacional": "sistema operacional",
  dominio: "domínio",
};

/**
 * Quanto uma mudança importa para o agente.
 *   alta  = muda o que o agente sabe ou deve fazer (um sistema surgiu ou sumiu, a máquina mudou de papel)
 *   media = muda como as coisas se conectam (portas, tarefas, conexões, programas instalados/removidos)
 *   baixa = rotina (atualização de versão, serviço do sistema operacional)
 */
function importance(area: string, d: FactDiff): Change["importance"] {
  if (area === "sistema" || area === "papel" || area === "dominio") return d.kind === "alterado" && area === "sistema" ? "media" : "alta";
  if (area === "porta" || area === "tarefa" || area === "odbc" || area === "rede") return "media";
  if (area === "programa") return d.kind === "alterado" ? "baixa" : "media";
  return "baixa";
}

function summarize(area: string, d: FactDiff, hostname: string): string {
  const label = AREA_LABEL[area] ?? area;
  const item = d.key.split(":").slice(3).join(":");
  const name = (v?: string) => {
    const base = (v ?? "").split(" [")[0].split(": ")[0];
    return area === "porta" ? `${item} (${base})` : base;
  };
  // Frases neutras quanto ao gênero ("porta", "programa", "tarefa"...).
  switch (d.kind) {
    case "adicionado":
      return `Apareceu em ${hostname}: ${label} ${name(d.after)}`;
    case "removido":
      return `Sumiu de ${hostname}: ${label} ${name(d.before)}`;
    case "alterado":
      return `Mudou em ${hostname}: ${label} ${area === "porta" ? item + ": " : ""}${d.before} → ${d.after}`;
  }
}

/**
 * Compara a análise anterior de uma máquina com a nova.
 * Devolve as mudanças (para o diário) e as perguntas de confirmação para as mais importantes.
 */
export function compareHosts(prev: Host, next: Host): { changes: NewChange[]; questions: NewQuestion[] } {
  const diffs = diffFacts(hostFacts(prev), hostFacts(next));
  const changes: NewChange[] = [];
  const questions: NewQuestion[] = [];
  const subject = `host:${next.hostname}`;

  for (const d of diffs) {
    const area = d.key.split(":")[2];
    const imp = importance(area, d);
    const summary = summarize(area, d, next.hostname);
    changes.push({
      layer: "tecnico",
      subject,
      kind: d.kind,
      area,
      item: d.key.split(":").slice(3).join(":") || area,
      before: d.before,
      after: d.after,
      importance: imp,
      summary,
      factKeys: [d.key],
    });

    if (imp !== "alta") continue;
    const text =
      area === "sistema" && d.kind === "removido"
        ? `${summary}. Ele foi desativado, levado para outra máquina ou substituído? Por qual sistema?`
        : area === "sistema" && d.kind === "adicionado"
          ? `${summary}. É um sistema novo em uso, um teste, ou uma substituição de outro?`
          : `${summary}. Essa mudança foi planejada?`;
    questions.push({
      layer: "tecnico",
      topic: subject,
      text,
      context: `Mudança detectada entre a análise de ${new Date(prev.collectedAt).toLocaleString("pt-BR")} e a de ${new Date(next.collectedAt).toLocaleString("pt-BR")}.`,
      source: "comparacao",
      askWho: "TI",
    });
  }
  return { changes, questions };
}

/** Mudança de resposta da entrevista. */
export function answerChange(id: string, prompt: string, before: string, after: string): NewChange {
  return {
    layer: "negocio",
    subject: "entrevista",
    kind: "alterado",
    area: "resposta",
    item: id,
    before,
    after,
    importance: "alta",
    summary: `Resposta alterada: "${prompt}"`,
    factKeys: [`empresa:${id}`],
  };
}

export function changeCounts(changes: Change[]): Record<Change["importance"], number> {
  return {
    alta: changes.filter((c) => c.importance === "alta").length,
    media: changes.filter((c) => c.importance === "media").length,
    baixa: changes.filter((c) => c.importance === "baixa").length,
  };
}
