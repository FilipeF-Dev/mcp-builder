import type { CompanyProfile } from "../core/schema.js";
import { LEVELS, type InterviewLevel, type InterviewQuestion } from "./levels.js";

export type AnswerMap = Record<string, unknown>;

export function answerMap(c: CompanyProfile): AnswerMap {
  return Object.fromEntries(Object.entries(c.answers).map(([k, v]) => [k, v.value]));
}

export function visibleQuestions(level: InterviewLevel, answers: AnswerMap): InterviewQuestion[] {
  return level.questions.filter((q) => !q.showIf || q.showIf(answers));
}

export interface LevelStatus {
  level: number;
  title: string;
  answered: number;
  deferred: number;
  total: number;
  /** Todas as obrigatórias respondidas ou explicitamente adiadas ("não sei"). */
  complete: boolean;
}

export function levelStatus(c: CompanyProfile): LevelStatus[] {
  const answers = answerMap(c);
  return LEVELS.map((l) => {
    const qs = visibleQuestions(l, answers);
    const answered = qs.filter((q) => q.id in c.answers).length;
    const deferred = qs.filter((q) => c.deferred.includes(q.id) && !(q.id in c.answers)).length;
    const complete = qs.filter((q) => q.required).every((q) => q.id in c.answers || c.deferred.includes(q.id));
    return { level: l.level, title: l.title, answered, deferred, total: qs.length, complete };
  });
}

/** Maior nível N tal que os níveis 1..N estão completos (0 se nenhum). */
export function completedUpTo(c: CompanyProfile): number {
  let n = 0;
  for (const s of levelStatus(c)) {
    if (!s.complete) break;
    n = s.level;
  }
  return n;
}
