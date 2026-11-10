/**
 * ETAPA 5: revisão e aprovação item a item.
 *
 * Itens revisáveis: cada skill gerada, o perfil da empresa e cada ferramenta do servidor.
 * Ao aprovar, uma CÓPIA da versão aprovada é guardada em aprovado/. O servidor MCP
 * só serve essas cópias: se a skill for refeita depois, o agente continua usando a
 * versão aprovada até alguém revisar a nova.
 */
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import type { Workspace } from "../core/workspace.js";
import { nowIso } from "../core/workspace.js";
import { loadContext, missingInfo, planSkills, skillsEnabled } from "../skills/index.js";
import { TOOLS } from "./tools.js";

export type ReviewStatus = "pendente" | "aprovado" | "recusado" | "mudou";

export interface ReviewItem {
  id: string;
  kind: "skill" | "contexto" | "ferramenta";
  title: string;
  /** Por que existe / o que faz. */
  detail: string;
  /** Arquivo do workspace com o conteúdo a revisar. */
  sourcePath?: string;
  /** Onde fica a cópia aprovada. */
  snapshotPath?: string;
  version: number;
  approvedVersion?: number;
  missing: number;
  status: ReviewStatus;
}

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  pendente: "aguardando revisão",
  aprovado: "aprovado",
  recusado: "recusado",
  mudou: "mudou desde a aprovação",
};

export function reviewItems(ws: Workspace): ReviewItem[] {
  if (!skillsEnabled(ws)) return [];
  const manifest = ws.loadManifest().artifacts;
  const approvals = ws.loadApprovals().items;
  const ctx = loadContext(ws);

  const status = (id: string, version: number): Pick<ReviewItem, "status" | "approvedVersion"> => {
    const a = approvals[id];
    if (!a) return { status: "pendente" };
    if (a.decision === "recusado") return { status: a.version === version ? "recusado" : "pendente", approvedVersion: undefined };
    return { status: a.version === version ? "aprovado" : "mudou", approvedVersion: a.version };
  };

  const items: ReviewItem[] = [];
  const ctxVersion = manifest["context/01-empresa.md"]?.version ?? 0;
  items.push({
    id: "contexto:empresa",
    kind: "contexto",
    title: "Perfil da empresa",
    detail: "O que a empresa faz, como atua, áreas, processos. O agente usa para entender o contexto das perguntas.",
    sourcePath: "context/01-empresa.md",
    snapshotPath: "aprovado/empresa.md",
    version: ctxVersion,
    missing: 0,
    ...status("contexto:empresa", ctxVersion),
  });

  for (const p of planSkills(ctx)) {
    const version = manifest[p.path]?.version ?? 0;
    if (!version) continue; // ainda não gerada
    const id = `skill:${p.name}`;
    items.push({
      id,
      kind: "skill",
      title: p.title,
      detail: `${p.kind === "fixo" ? "Skill fixa" : "Skill adaptada"}. ${p.why}`,
      sourcePath: p.path,
      snapshotPath: `aprovado/skills/${p.name}.md`,
      version,
      missing: missingInfo(ctx, p).length,
      ...status(id, version),
    });
  }

  for (const t of TOOLS) {
    const id = `ferramenta:${t.id}`;
    items.push({ id, kind: "ferramenta", title: t.title, detail: `${t.what}${t.readOnly ? " (somente leitura)" : ""}`, version: t.revision, missing: 0, ...status(id, t.revision) });
  }
  return items;
}

/** Registra a decisão. Aprovar guarda uma cópia exata da versão aprovada. */
export function decide(ws: Workspace, item: ReviewItem, decision: "aprovado" | "recusado"): void {
  const approvals = ws.loadApprovals();
  approvals.items[item.id] = { decision, version: item.version, at: nowIso() };
  ws.saveApprovals(approvals);

  if (!item.snapshotPath || !item.sourcePath) return;
  const snap = ws.path(item.snapshotPath);
  if (decision === "aprovado") {
    mkdirSync(dirname(snap), { recursive: true });
    copyFileSync(ws.path(item.sourcePath), snap);
  } else if (existsSync(snap)) {
    rmSync(snap);
  }
}

export interface ReviewSummary {
  approved: number;
  rejected: number;
  waiting: number;
  total: number;
}

export function reviewSummary(items: ReviewItem[]): ReviewSummary {
  return {
    approved: items.filter((i) => i.status === "aprovado").length,
    rejected: items.filter((i) => i.status === "recusado").length,
    waiting: items.filter((i) => i.status === "pendente" || i.status === "mudou").length,
    total: items.length,
  };
}
