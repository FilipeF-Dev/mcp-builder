import type { Workspace } from "../core/workspace.js";
import { LEVELS } from "./levels.js";
import { answerMap, levelStatus, visibleQuestions } from "./progress.js";

/**
 * Gera context/01-empresa.md a partir da entrevista, sem LLM.
 * É o primeiro pedaço de contexto que o agente recebe: quem é a empresa e como ela funciona.
 * A versão enriquecida (com síntese pela Claude) virá numa etapa posterior.
 */
export function renderCompanyContext(ws: Workspace): string {
  const company = ws.loadCompany();
  const answers = answerMap(company);
  const status = levelStatus(company);
  const out: string[] = [];

  out.push(`# ${company.name}: perfil da empresa`);
  out.push("");
  out.push("> Gerado pelo MCP-Builder a partir da entrevista de negócio. Organizado do básico ao complexo.");
  out.push(`> Atualizado em ${new Date(company.updatedAt).toLocaleString("pt-BR")}.`);
  out.push("");

  for (const level of LEVELS) {
    const qs = visibleQuestions(level, answers);
    const answered = qs.filter((q) => {
      const v = answers[q.id];
      return v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);
    });
    const deferred = qs.filter((q) => company.deferred.includes(q.id) && !(q.id in company.answers));
    if (answered.length === 0 && deferred.length === 0) continue;

    const st = status.find((s) => s.level === level.level)!;
    out.push(`## ${level.level}. ${level.title}${st.complete ? "" : " (incompleto)"}`);
    out.push("");
    for (const q of answered) {
      const v = answers[q.id];
      if (Array.isArray(v)) {
        out.push(`**${q.prompt}**`);
        for (const item of v) out.push(`- ${item}`);
      } else {
        out.push(`**${q.prompt}**  `);
        out.push(String(v));
      }
      out.push("");
    }
    if (deferred.length) {
      out.push("_Ainda sem resposta (pendências):_");
      for (const q of deferred) out.push(`- ${q.prompt}${q.askWho ? ` (perguntar a: ${q.askWho})` : ""}`);
      out.push("");
    }
  }
  return out.join("\n");
}

export function writeCompanyContext(ws: Workspace): string {
  return ws.writeContext("01-empresa.md", renderCompanyContext(ws));
}
