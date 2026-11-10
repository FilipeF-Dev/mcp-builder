/**
 * MODELOS DE SKILL: "skills que geram skills".
 *
 * Um modelo olha para o que se sabe da empresa (SkillContext) e decide:
 *   1. SE se aplica (e por quê);
 *   2. quantas skills gera (ex.: uma por ERP encontrado);
 *   3. de quais FATOS cada skill depende (para regenerar só o que mudou);
 *   4. quais informações FALTAM (viram pendências para uma pessoa);
 *   5. o conteúdo da skill e as regras de segurança (guardrails) que ela impõe.
 *
 * Dois tipos:
 *   - "fixo":      conceitos válidos para qualquer empresa (LGPD, senhas...). Sempre se aplica;
 *                  o texto base é pronto e só os detalhes da empresa são preenchidos.
 *   - "adaptavel": nasce da interpretação do ambiente (há um ERP, há servidor de e-mail...).
 */
import type { SkillContext } from "./context.js";

export type SkillKind = "fixo" | "adaptavel";

/** Uma informação que a skill precisa e que talvez ninguém tenha dado ainda. */
export interface SkillNeed {
  /** Chave estável dentro da skill (vira o fato "skill-info:<skill>:<key>"). */
  key: string;
  question: string;
  askWho?: string;
  /** Explica para que a informação será usada (aparece na pendência). */
  why: string;
}

export interface SkillSection {
  title: string;
  /** Linhas em markdown. */
  lines: string[];
}

export interface SkillContent {
  /** Quando o agente deve usar esta skill (vai no cabeçalho do SKILL.md; 3ª pessoa). */
  description: string;
  sections: SkillSection[];
  /** Regras que o agente nunca pode violar (consolidadas também em guardrails.md). */
  guardrails: string[];
}

export interface SkillPlan {
  /** Nome da skill: minúsculas e hífens (formato Agent Skills). */
  name: string;
  title: string;
  kind: SkillKind;
  /** Área para agrupar no relatório: Segurança, Sistemas, Suporte, Conduta. */
  area: string;
  /** Por que esta skill foi criada para ESTA empresa (aparece no relatório). */
  why: string;
  /** Prefixos de fatos dos quais o conteúdo depende. */
  dependsOn: string[];
  needs: SkillNeed[];
  /** Monta o conteúdo. `info(key)` devolve a resposta da pendência, se houver. */
  build: (info: (key: string) => string | undefined) => SkillContent;
}

export interface SkillTemplate {
  id: string;
  kind: SkillKind;
  /**
   * Revisão do TEXTO do modelo. Aumente sempre que mudar o que o modelo escreve:
   * as skills geradas por ele serão refeitas mesmo sem mudança nos fatos da empresa.
   */
  revision: number;
  /** Uma frase sobre o que o modelo faz (documentação). */
  summary: string;
  plan: (ctx: SkillContext) => SkillPlan[];
}
