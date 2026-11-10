/**
 * GERAÇÃO INCREMENTAL.
 *
 * Cada arquivo que o MCP-Builder gera (contexto, skills, guardrails) é registrado
 * aqui com os prefixos de FATOS de que depende. Na hora de atualizar, só é
 * regenerado o arquivo cuja impressão digital mudou. Assim:
 *   - trocar o servidor de e-mail regenera só o que fala de e-mail;
 *   - o que já foi revisado e aprovado e não foi afetado continua intocado.
 */
import { rmSync } from "node:fs";
import { dirname } from "node:path";
import type { Workspace } from "./core/workspace.js";
import { nowIso } from "./core/workspace.js";
import { allFacts, fingerprint } from "./core/facts.js";
import { writeCompanyContext } from "./company/context.js";
import { writeHostsContext } from "./collectors/host/context.js";
import { SERVER_DIR, serverEnabled, writeServer } from "./delivery/server.js";
import { SERVER_REVISION } from "./delivery/tools.js";
import { GUARDRAILS_PATH, SKILLS_DIR, loadContext, planSkills, skillsEnabled, writeGuardrails, writeSkill } from "./skills/index.js";

export interface Generator {
  /** Caminho relativo ao workspace. */
  path: string;
  /** O que este arquivo é, em linguagem simples (aparece no relatório). */
  description: string;
  /** Prefixos de fatos dos quais o conteúdo depende. */
  dependsOn: string[];
  /** Revisão do gerador: mudar o texto de um modelo também exige refazer o arquivo. */
  revision?: string;
  generate: (ws: Workspace) => void;
}

const STATIC_GENERATORS: Generator[] = [
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
];

/** Geradores do momento: os fixos + uma skill por plano + guardrails (se a etapa 4 estiver liberada). */
export function currentGenerators(ws: Workspace): Generator[] {
  if (!skillsEnabled(ws)) return STATIC_GENERATORS;
  const plans = planSkills(loadContext(ws));
  const skills: Generator[] = plans.map((p) => ({
    path: p.path,
    description: `Skill: ${p.title}`,
    dependsOn: p.dependsOn,
    revision: `${p.templateId}@${p.revision}`,
    generate: (w) => writeSkill(w, p.name),
  }));
  const guardrails: Generator = {
    path: GUARDRAILS_PATH,
    description: "Regras de segurança consolidadas de todas as skills",
    // Depende de tudo de que as skills dependem, mais o conjunto de skills existente.
    dependsOn: [...new Set(plans.flatMap((p) => p.dependsOn))],
    revision: plans.map((p) => `${p.templateId}@${p.revision}`).sort().join(","),
    generate: writeGuardrails,
  };
  const out = [...STATIC_GENERATORS, ...skills, guardrails];
  if (serverEnabled(ws)) {
    out.push({
      path: SERVER_DIR,
      description: "Servidor MCP com o conteúdo aprovado",
      // Muda quando uma aprovação muda, quando as regras mudam ou quando o nome da empresa muda.
      dependsOn: ["aprovacao:", "empresa:nome", ...guardrails.dependsOn],
      revision: `servidor@${SERVER_REVISION};${guardrails.revision}`,
      generate: writeServer,
    });
  }
  return out;
}

export interface RefreshResult {
  regenerated: string[];
  unchanged: string[];
  /** Arquivos que deixaram de fazer sentido (ex.: o sistema sumiu) e foram removidos. */
  removed: string[];
}

/** Regenera só os arquivos cujos fatos mudaram. Com `force`, regenera tudo. */
export function refreshArtifacts(ws: Workspace, force = false): RefreshResult {
  const facts = allFacts(ws.loadCompany(), ws.loadInventory(), ws.loadQuestions(), ws.loadApprovals());
  const manifest = ws.loadManifest();
  const result: RefreshResult = { regenerated: [], unchanged: [], removed: [] };
  const generators = currentGenerators(ws);
  const current = new Set(generators.map((g) => g.path));

  for (const g of generators) {
    // A impressão digital inclui as dependências e a revisão do modelo: mudar o texto do modelo também força regerar.
    const fp = fingerprint(facts, g.dependsOn) + ":" + g.dependsOn.length + (g.revision ? ":" + g.revision : "");
    const prev = manifest.artifacts[g.path];
    if (!force && prev && prev.fingerprint === fp) {
      result.unchanged.push(g.path);
      continue;
    }
    g.generate(ws);
    manifest.artifacts[g.path] = { path: g.path, dependsOn: g.dependsOn, fingerprint: fp, generatedAt: nowIso(), version: (prev?.version ?? 0) + 1 };
    result.regenerated.push(g.path);
  }

  // Skills que não se aplicam mais (ex.: o servidor de e-mail sumiu e nenhum outro foi citado).
  for (const path of Object.keys(manifest.artifacts)) {
    if (current.has(path) || !path.startsWith(SKILLS_DIR + "/")) continue;
    rmSync(ws.path(dirname(path)), { recursive: true, force: true });
    delete manifest.artifacts[path];
    result.removed.push(path);
  }

  ws.saveManifest(manifest);
  return result;
}
