/**
 * Motor das skills: aplica os modelos ao conhecimento da empresa e produz
 *   saida/skills/<nome>/SKILL.md   uma skill por pasta (formato Agent Skills)
 *   saida/guardrails.md            todas as regras de segurança consolidadas
 *
 * Cada arquivo é registrado como gerador (generation.ts) com as dependências da skill,
 * então só é refeito quando os fatos dos quais depende mudam.
 */
import type { Workspace } from "../core/workspace.js";
import type { Question } from "../core/schema.js";
import { SKILL_TOPIC } from "../core/facts.js";
import { completedUpTo } from "../company/progress.js";
import { LEVELS } from "../company/levels.js";
import { SkillContext } from "./context.js";
import type { SkillContent, SkillPlan, SkillTemplate } from "./types.js";
import { FIXED_TEMPLATES } from "./templates/fixed.js";
import { ADAPTIVE_TEMPLATES } from "./templates/adaptive.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const TEMPLATES: SkillTemplate[] = [...FIXED_TEMPLATES, ...ADAPTIVE_TEMPLATES];
export const SKILLS_DIR = "saida/skills";
export const GUARDRAILS_PATH = "saida/guardrails.md";

export interface PlannedSkill extends SkillPlan {
  templateId: string;
  revision: number;
  path: string;
}

/** As skills só são montadas com a entrevista completa: é o nível 6 que define os limites do agente. */
export function skillsEnabled(ws: Workspace): boolean {
  return completedUpTo(ws.loadCompany()) >= LEVELS.length;
}

export function loadContext(ws: Workspace): SkillContext {
  return new SkillContext(ws.loadCompany(), ws.loadInventory(), ws.loadQuestions());
}

export function planSkills(ctx: SkillContext): PlannedSkill[] {
  const seen = new Set<string>();
  const out: PlannedSkill[] = [];
  for (const t of TEMPLATES) {
    for (const p of t.plan(ctx)) {
      if (seen.has(p.name)) continue; // dois modelos nunca geram a mesma skill
      seen.add(p.name);
      out.push({ ...p, templateId: t.id, revision: t.revision, path: `${SKILLS_DIR}/${p.name}/SKILL.md` });
    }
  }
  return out;
}

/** Resposta de uma informação que a skill pediu (pendência com tópico skill:<nome>:<chave>). */
function infoGetter(ctx: SkillContext, skill: string) {
  return (key: string) => {
    const q = ctx.questions.find((x) => x.topic === `${SKILL_TOPIC}${skill}:${key}` && x.status === "respondida");
    return q?.answer;
  };
}

export function missingInfo(ctx: SkillContext, plan: SkillPlan): string[] {
  const get = infoGetter(ctx, plan.name);
  return plan.needs.filter((n) => !get(n.key)).map((n) => n.key);
}

export function renderSkill(ctx: SkillContext, plan: PlannedSkill): { markdown: string; content: SkillContent } {
  const content = plan.build(infoGetter(ctx, plan.name));
  const out: string[] = [
    "---",
    `name: ${plan.name}`,
    `description: ${JSON.stringify(content.description)}`,
    "---",
    "",
    `# ${plan.title}`,
    "",
  ];
  for (const s of content.sections) out.push(`## ${s.title}`, "", ...s.lines, "");
  if (content.guardrails.length) {
    out.push("## Regras que nunca podem ser quebradas", "", ...content.guardrails.map((g) => `- ${g}`), "");
  }
  out.push(
    `<!-- Gerado pelo MCP-Builder. Modelo: ${plan.templateId} (${plan.kind}). Motivo: ${plan.why.replace(/--/g, "-")} -->`,
    "",
  );
  return { markdown: out.join("\n"), content };
}

function write(ws: Workspace, rel: string, text: string): void {
  const p = ws.path(rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text, "utf8");
}

export function writeSkill(ws: Workspace, name: string): void {
  const ctx = loadContext(ws);
  const plan = planSkills(ctx).find((p) => p.name === name);
  if (plan) write(ws, plan.path, renderSkill(ctx, plan).markdown);
}

export function writeGuardrails(ws: Workspace): void {
  const ctx = loadContext(ws);
  const out: string[] = [
    `# Regras de segurança do assistente: ${ctx.name}`,
    "",
    "> Gerado pelo MCP-Builder a partir de todas as skills. Estas regras valem para **todas** as conversas,",
    "> e o servidor MCP (próxima etapa) vai aplicá-las também nas ferramentas, não só no texto.",
    "",
  ];
  const seen = new Set<string>();
  for (const plan of planSkills(ctx)) {
    const rules = renderSkill(ctx, plan).content.guardrails.filter((g) => !seen.has(g));
    rules.forEach((g) => seen.add(g));
    if (!rules.length) continue;
    out.push(`## ${plan.title}`, "", ...rules.map((g) => `- ${g}`), "");
  }
  write(ws, GUARDRAILS_PATH, out.join("\n"));
}

/** Perguntas para as informações que as skills ainda não têm. */
export function skillQuestions(ctx: SkillContext): Array<Omit<Question, "id" | "status" | "createdAt">> {
  const out: Array<Omit<Question, "id" | "status" | "createdAt">> = [];
  for (const plan of planSkills(ctx)) {
    for (const need of plan.needs) {
      const topic = `${SKILL_TOPIC}${plan.name}:${need.key}`;
      if (ctx.questions.some((q) => q.topic === topic && q.status !== "aberta")) continue;
      out.push({ layer: "negocio", topic, text: need.question, context: `Para a skill "${plan.title}": ${need.why}`, source: `modelo:${plan.templateId}`, askWho: need.askWho });
    }
  }
  return out;
}
