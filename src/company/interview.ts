import type { Workspace } from "../core/workspace.js";
import { nowIso } from "../core/workspace.js";
import type { CompanyProfile } from "../core/schema.js";
import { Prompter } from "../core/prompt.js";
import { LEVELS, findQuestion, type InterviewQuestion } from "./levels.js";
import { answerMap, completedUpTo, levelStatus, visibleQuestions } from "./progress.js";
import { refreshArtifacts } from "../generation.js";
import { answerChange } from "../core/changes.js";
import { writeReport } from "../report/html.js";
import { ui as c } from "../core/ui.js";

type Value = string | number | string[];

export interface InterviewOptions {
  /** Executa só este nível. */
  level?: number;
  /** Repergunta o que já foi respondido (Enter mantém a resposta atual). */
  review?: boolean;
}

class StopInterview extends Error {}

/**
 * Converte o texto digitado no valor tipado da pergunta.
 * Retorna string de erro se inválido.
 */
export function parseAnswer(q: InterviewQuestion, raw: string): Value | { error: string } {
  const text = raw.trim();
  switch (q.type) {
    case "text":
      return text;
    case "number": {
      const n = Number(text.replace(/\./g, "").replace(",", "."));
      return Number.isFinite(n) ? n : { error: "Digite um número." };
    }
    case "list": {
      const items = text.split(";").map((s) => s.trim()).filter(Boolean);
      return items.length ? items : { error: "Informe ao menos um item (separe por ;)." };
    }
    case "choice":
    case "multi": {
      const opts = q.options ?? [];
      const parts = text.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      const picked: string[] = [];
      for (const p of parts) {
        const idx = Number(p);
        if (Number.isInteger(idx) && idx >= 1 && idx <= opts.length) picked.push(opts[idx - 1]);
        else {
          const match = opts.find((o) => o.toLowerCase() === p.toLowerCase());
          if (match) picked.push(match);
          else if (opts.includes("Outro")) picked.push(`Outro: ${p}`);
          else return { error: `Opção inválida: "${p}". Use os números da lista.` };
        }
      }
      if (picked.length === 0) return { error: "Escolha uma opção." };
      if (q.type === "choice") {
        if (picked.length > 1) return { error: "Escolha apenas uma opção." };
        return picked[0];
      }
      return [...new Set(picked)];
    }
  }
}

function formatValue(v: unknown): string {
  return Array.isArray(v) ? v.join("; ") : String(v);
}

async function askQuestion(
  p: Prompter,
  q: InterviewQuestion,
  current: unknown,
): Promise<{ kind: "answer"; value: Value } | { kind: "skip" } | { kind: "defer" }> {
  console.log("\n" + c.bold(q.prompt) + (q.required ? "" : c.dim(" (opcional)")));
  if (q.help) console.log(c.dim("  " + q.help));
  if (q.options) {
    q.options.forEach((o, i) => console.log(`  ${c.cyan(String(i + 1).padStart(2))}. ${o}`));
    if (q.type === "multi") console.log(c.dim("  Pode escolher várias: ex. 1,3,4"));
  }
  if (current !== undefined) console.log(c.dim(`  Atual: ${formatValue(current)}  (Enter mantém)`));

  for (;;) {
    const raw = await p.ask(c.cyan("> "));
    if (raw === null) throw new StopInterview();
    const t = raw.trim();
    if (t === "!sair") throw new StopInterview();
    if (t === "?") return { kind: "defer" };
    if (t === "") {
      if (current !== undefined) return { kind: "answer", value: current as Value };
      if (!q.required) return { kind: "skip" };
      console.log(c.yellow("  Pergunta obrigatória. Digite ? se não souber (vira uma pendência para outra pessoa)."));
      continue;
    }
    const parsed = parseAnswer(q, t);
    if (typeof parsed === "object" && !Array.isArray(parsed)) {
      console.log(c.yellow("  " + parsed.error));
      continue;
    }
    // "Outro" escolhido pelo número: pede o detalhe.
    if (parsed === "Outro" || (Array.isArray(parsed) && parsed.includes("Outro"))) {
      const detail = await p.ask(c.cyan("  Qual? > "));
      if (detail === null) throw new StopInterview();
      const label = `Outro: ${detail.trim() || "não especificado"}`;
      return { kind: "answer", value: Array.isArray(parsed) ? parsed.map((x) => (x === "Outro" ? label : x)) : label };
    }
    return { kind: "answer", value: parsed };
  }
}

function deferQuestion(ws: Workspace, company: CompanyProfile, q: InterviewQuestion, levelTitle: string): void {
  if (!company.deferred.includes(q.id)) company.deferred.push(q.id);
  ws.addQuestions([
    {
      layer: "negocio",
      topic: `entrevista:${q.id}`,
      text: q.prompt,
      context: `Nível "${levelTitle}" da entrevista: o entrevistado não soube responder.`,
      source: "entrevista",
      askWho: q.askWho,
    },
  ]);
}

/** Registra uma resposta (usado pela entrevista e pela importação). */
export function recordAnswer(ws: Workspace, company: CompanyProfile, id: string, value: Value): void {
  const prev = company.answers[id];
  if (prev && formatValue(prev.value) === formatValue(value)) return; // nada mudou
  // Resposta corrigida: entra no diário de mudanças (o agente pode estar usando a versão antiga).
  if (prev && formatValue(prev.value) !== "") {
    ws.appendChanges([answerChange(id, findQuestion(id)?.prompt ?? id, formatValue(prev.value), formatValue(value))]);
  }
  company.answers[id] = { value, answeredAt: nowIso() };
  company.deferred = company.deferred.filter((d) => d !== id);
  // Se havia pendência dessa pergunta na fila, marca como respondida.
  const qs = ws.loadQuestions();
  let changed = false;
  for (const q of qs) {
    if (q.topic === `entrevista:${id}` && q.status === "aberta") {
      q.status = "respondida";
      q.answer = formatValue(value);
      q.answeredAt = nowIso();
      changed = true;
    }
  }
  if (changed) ws.saveQuestions(qs);
}

export async function runInterview(ws: Workspace, opts: InterviewOptions = {}): Promise<void> {
  let company = ws.loadCompany();
  const p = Prompter.shared();

  console.log(c.bold(`\nEntrevista de negócio: ${company.name}`));
  console.log(c.dim("Vamos do básico ao complexo. Cada nível embasa decisões do agente que será construído."));
  console.log(c.dim("Dicas: ? = não sei (vira pendência para outra pessoa) · Enter = pular as opcionais · !sair = salvar e voltar\n"));

  try {
    for (const level of LEVELS) {
      if (opts.level !== undefined && level.level !== opts.level) continue;

      const done = completedUpTo(company);
      if (level.level > done + 1 && !opts.review) {
        console.log(c.yellow(`\nNível ${level.level} bloqueado: conclua antes o nível ${done + 1}.`));
        break;
      }

      const isPending = (q: InterviewQuestion) =>
        opts.review || (!(q.id in company.answers) && !company.deferred.includes(q.id));
      if (!visibleQuestions(level, answerMap(company)).some(isPending)) continue;

      console.log("\n" + c.bold(c.cyan(`━━ Nível ${level.level}: ${level.title} ━━`)));
      console.log(c.dim(level.why));
      console.log(c.dim("Isto vai embasar: " + level.informs.join(" · ")));

      // Visibilidade reavaliada a cada pergunta: respostas anteriores liberam perguntas condicionais.
      for (const q of level.questions) {
        if (q.showIf && !q.showIf(answerMap(company))) continue;
        if (!isPending(q)) continue;
        const res = await askQuestion(p, q, company.answers[q.id]?.value);
        if (res.kind === "answer") recordAnswer(ws, company, q.id, res.value);
        else if (res.kind === "skip") recordAnswer(ws, company, q.id, "");
        else {
          deferQuestion(ws, company, q, level.title);
          console.log(c.dim("  Anotado como pendência" + (q.askWho ? ` (sugestão: perguntar a ${q.askWho})` : "") + "."));
        }
        ws.saveCompany(company);
        company = ws.loadCompany();
      }
      refreshArtifacts(ws);
      console.log(c.bold(`\n✓ Nível ${level.level} concluído.`));
    }
  } catch (e) {
    if (!(e instanceof StopInterview)) throw e;
    console.log(c.dim("\nRespostas salvas. Você pode continuar depois, de onde parou."));
  } finally {
    refreshArtifacts(ws);
    writeReport(ws);
  }

  printLevelSummary(ws.loadCompany());
}

export function printLevelSummary(company: CompanyProfile): void {
  console.log(c.bold("\nProgresso da camada de negócio:"));
  for (const s of levelStatus(company)) {
    const mark = s.complete ? "✓" : s.answered > 0 ? "…" : " ";
    const extra = s.deferred ? c.yellow(` (${s.deferred} pendente(s))`) : "";
    console.log(`  [${mark}] Nível ${s.level}: ${s.title}  ${c.dim(`${s.answered}/${s.total}`)}${extra}`);
  }
}

/** Importa respostas de um JSON { "id_da_pergunta": valor }. Útil para formulários e automação. */
export function importAnswers(ws: Workspace, data: Record<string, unknown>): { ok: string[]; errors: string[] } {
  const company = ws.loadCompany();
  const ok: string[] = [];
  const errors: string[] = [];
  for (const [id, raw] of Object.entries(data)) {
    const q = findQuestion(id);
    if (!q) {
      errors.push(`${id}: pergunta desconhecida`);
      continue;
    }
    if (raw === "?") {
      const level = LEVELS.find((l) => l.questions.includes(q))!;
      deferQuestion(ws, company, q, level.title);
      ok.push(`${id} (pendência)`);
      continue;
    }
    const text = Array.isArray(raw) ? raw.join(q.type === "list" ? ";" : ",") : String(raw);
    const parsed = parseAnswer(q, text);
    if (typeof parsed === "object" && !Array.isArray(parsed)) {
      errors.push(`${id}: ${parsed.error}`);
      continue;
    }
    recordAnswer(ws, company, id, parsed);
    ok.push(id);
  }
  ws.saveCompany(company);
  refreshArtifacts(ws);
  writeReport(ws);
  return { ok, errors };
}
