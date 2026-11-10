import type { CompanyProfile, Inventory, Question } from "../core/schema.js";
import { allFacts, type Facts } from "../core/facts.js";

export interface FoundSystem {
  signatureId: string;
  name: string;
  category: string;
  hosts: string[];
}

/**
 * Tudo o que um modelo de skill pode consultar, com atalhos para os casos comuns.
 * Os modelos NÃO leem arquivos diretamente: só por aqui, para que as dependências fiquem claras.
 */
export class SkillContext {
  readonly facts: Facts;

  constructor(
    readonly company: CompanyProfile,
    readonly inv: Inventory,
    readonly questions: Question[],
  ) {
    this.facts = allFacts(company, inv, questions);
  }

  get name(): string {
    return this.company.name;
  }

  /** Resposta da entrevista como texto (listas unidas por "; "). Vazio/pendente → undefined. */
  a(id: string): string | undefined {
    const v = this.company.answers[id]?.value;
    if (v === undefined || v === "") return undefined;
    return Array.isArray(v) ? v.join("; ") : String(v);
  }

  /** Resposta da entrevista como lista. */
  list(id: string): string[] {
    const v = this.company.answers[id]?.value;
    if (Array.isArray(v)) return v;
    if (v === undefined || v === "") return [];
    return String(v).split(";").map((s) => s.trim()).filter(Boolean);
  }

  /** A resposta menciona o termo? (sem diferenciar maiúsculas/acentos) */
  mentions(id: string, term: string): boolean {
    const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const v = this.a(id);
    return !!v && norm(v).includes(norm(term));
  }

  /** Sistemas encontrados na análise técnica, agrupados (uma entrada por sistema). */
  systems(category?: string): FoundSystem[] {
    const map = new Map<string, FoundSystem>();
    for (const h of this.inv.hosts) {
      for (const s of h.systems) {
        if (category && s.category !== category) continue;
        const cur = map.get(s.signatureId) ?? { signatureId: s.signatureId, name: s.systemName, category: s.category, hosts: [] };
        cur.hosts.push(h.hostname);
        map.set(s.signatureId, cur);
      }
    }
    return [...map.values()];
  }
}
