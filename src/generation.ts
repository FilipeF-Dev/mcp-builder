/**
 * GERAÇÃO INCREMENTAL.
 *
 * Cada arquivo que o MCP-Builder gera (contexto hoje; skills e guardrails em breve) é
 * registrado aqui com os prefixos de FATOS de que depende. Na hora de atualizar,
 * só é regenerado o arquivo cuja impressão digital mudou. Assim:
 *   - trocar o servidor de e-mail regenera só o que fala de e-mail;
 *   - o que já foi revisado e aprovado e não foi afetado continua intocado.
 */
import type { Workspace } from "./core/workspace.js";
import { nowIso } from "./core/workspace.js";
import { allFacts, fingerprint } from "./core/facts.js";
import { writeCompanyContext } from "./company/context.js";
import { writeHostsContext } from "./collectors/host/context.js";

export interface Generator {
  /** Caminho relativo ao workspace. */
  path: string;
  /** O que este arquivo é, em linguagem simples (aparece no relatório). */
  description: string;
  /** Prefixos de fatos dos quais o conteúdo depende. */
  dependsOn: string[];
  generate: (ws: Workspace) => void;
}

export const GENERATORS: Generator[] = [
  {
    path: "context/01-empresa.md",
    description: "Perfil da empresa (o que ela faz, como atua, pessoas, processos, regras)",
    dependsOn: ["empresa:"],
    generate: (ws) => void writeCompanyContext(ws),
  },
  {
    path: "context/10-hosts.md",
    description: "Computadores analisados e sistemas reconhecidos",
    dependsOn: ["host:"],
    generate: (ws) => void writeHostsContext(ws),
  },
  // Próximas frentes registram aqui seus geradores (skills, guardrails, servidor MCP).
];

export interface RefreshResult {
  regenerated: string[];
  unchanged: string[];
}

/** Regenera só os arquivos cujos fatos mudaram. Com `force`, regenera tudo. */
export function refreshArtifacts(ws: Workspace, force = false): RefreshResult {
  const facts = allFacts(ws.loadCompany(), ws.loadInventory(), ws.loadQuestions());
  const manifest = ws.loadManifest();
  const result: RefreshResult = { regenerated: [], unchanged: [] };

  for (const g of GENERATORS) {
    const fp = fingerprint(facts, g.dependsOn);
    const prev = manifest.artifacts[g.path];
    if (!force && prev && prev.fingerprint === fp) {
      result.unchanged.push(g.path);
      continue;
    }
    g.generate(ws);
    manifest.artifacts[g.path] = {
      path: g.path,
      dependsOn: g.dependsOn,
      fingerprint: fp,
      generatedAt: nowIso(),
      version: (prev?.version ?? 0) + 1,
    };
    result.regenerated.push(g.path);
  }
  ws.saveManifest(manifest);
  return result;
}
