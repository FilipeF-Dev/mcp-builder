import type { Host, SystemMatch } from "../core/schema.js";
import { SIGNATURES, type Signature } from "./catalog.js";

/**
 * Compara o host coletado com o catálogo de assinaturas.
 * Evidências "fortes" (programa, serviço, processo, configuração) contam 2; porta conta 1.
 *   >= 4 → alta · 2–3 → média · 1 → baixa (só porta: descartado, porta sozinha não identifica nada)
 * Assinaturas marcadas como `ambiguous` perdem 1 ponto.
 */
export function matchSignatures(
  host: Pick<Host, "software" | "services" | "listeningPorts" | "dataSources" | "scheduledTasks">,
catalog: Signature[] = SIGNATURES): SystemMatch[] {
  const results: SystemMatch[] = [];

  for (const sig of catalog) {
    const evidence: string[] = [];
    let score = 0;
    let strong = 0;

    if (sig.software) {
      const hits = host.software.filter((s) => sig.software!.test([s.name, s.publisher, s.installLocation].filter(Boolean).join(" | ")));
      if (hits.length) {
        score += 2;
        strong++;
        evidence.push(...hits.slice(0, 3).map((h) => `programa instalado: ${h.name}${h.version && !h.name.includes(h.version) ? ` ${h.version}` : ""}`));
      }
    }
    if (sig.service) {
      const hits = host.services.filter((s) => sig.service!.test([s.name, s.displayName, s.command].filter(Boolean).join(" | ")));
      if (hits.length) {
        score += 2;
        strong++;
        evidence.push(...hits.slice(0, 3).map((h) => `serviço: ${h.displayName ?? h.name} (${h.state ?? "?"})`));
      }
    }
    if (sig.process) {
      const hits = host.listeningPorts.filter((p) => p.process && sig.process!.test(p.process));
      if (hits.length) {
        score += 2;
        strong++;
        evidence.push(...hits.slice(0, 3).map((h) => `processo ${h.process} escutando em ${h.protocol}/${h.port}`));
      }
    }
    if (sig.config) {
      const hits = [
        ...host.dataSources.filter((d) => sig.config!.test([d.name, d.driver, d.details].filter(Boolean).join(" | "))).map((d) => `fonte de dados ${d.kind}: ${d.name}`),
        ...host.scheduledTasks.filter((t) => sig.config!.test([t.name, t.action].filter(Boolean).join(" | "))).map((t) => `tarefa agendada: ${t.name}`),
      ];
      if (hits.length) {
        score += 2;
        strong++;
        evidence.push(...hits.slice(0, 3));
      }
    }
    if (sig.ports && strong > 0) {
      const hits = host.listeningPorts.filter((p) => sig.ports!.includes(p.port));
      if (hits.length) {
        score += 1;
        evidence.push(`porta típica aberta: ${[...new Set(hits.map((h) => h.port))].join(", ")}`);
      }
    }

    if (strong === 0) continue;
    // Assinaturas ambíguas (nome genérico) perdem um nível de confiança.
    if (sig.ambiguous) score -= 1;
    results.push({
      signatureId: sig.id,
      systemName: sig.name,
      category: sig.category,
      confidence: score >= 4 ? "alta" : score >= 2 ? "media" : "baixa",
      evidence,
    });
  }
  return results;
}
