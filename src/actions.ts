/**
 * Ações de alto nível, compartilhadas pelo menu guiado e pelos comandos avançados.
 */
import { Workspace, nowIso } from "./core/workspace.js";
import { Prompter } from "./core/prompt.js";
import { completedUpTo } from "./company/progress.js";
import { MIN_LEVEL_FOR_TECH_SCAN } from "./company/levels.js";
import { collectLocalHost } from "./collectors/host/index.js";
import { analyzeHost } from "./collectors/host/analyze.js";
import { compareHosts } from "./core/changes.js";
import { refreshArtifacts } from "./generation.js";
import { writeReport } from "./report/html.js";
import { ui } from "./core/ui.js";
import { categoryLabel, confidenceLabel, topicLabel } from "./core/labels.js";

/** Analisa esta máquina. Retorna false se bloqueado pela entrevista. */
export async function scanHostAction(ws: Workspace, force = false): Promise<boolean> {
  const company = ws.loadCompany();
  const done = completedUpTo(company);
  if (done < MIN_LEVEL_FOR_TECH_SCAN && !force) {
    console.log(ui.yellow(`\nAinda não dá para analisar a tecnologia: conclua antes os níveis 1 a ${MIN_LEVEL_FOR_TECH_SCAN} da entrevista (concluído até o nível ${done}).`));
    console.log(ui.dim("Motivo: sem saber o ramo e como a empresa atua, não há como interpretar o que for encontrado."));
    return false;
  }

  console.log("\nAnalisando este computador. Isso leva cerca de 15 a 60 segundos...");
  console.log(ui.dim("Somente leitura: nada é instalado, alterado ou enviado para fora."));
  const host = await collectLocalHost();
  const inv = ws.loadInventory();
  const prev = inv.hosts.find((h) => h.id === host.id);

  // Reanálise: guarda a versão anterior e registra só o que mudou.
  let comparison: ReturnType<typeof compareHosts> | undefined;
  if (prev) {
    ws.archiveHost(prev);
    comparison = compareHosts(prev, host);
    ws.appendChanges(comparison.changes);
  }

  inv.hosts = [...inv.hosts.filter((h) => h.id !== host.id), host];
  ws.saveInventory(inv);
  const added = ws.addQuestions([...(comparison?.questions ?? []), ...analyzeHost(host, company)]);
  const refreshed = refreshArtifacts(ws);
  writeReport(ws);

  console.log(ui.green(`\n✓ ${host.hostname} analisado (${host.role ?? "papel desconhecido"}, ${host.os.name})`));
  console.log(`  ${host.software.length} programas · ${host.services.length} serviços · ${host.listeningPorts.length} portas · ${host.scheduledTasks.length} tarefas agendadas · ${host.dataSources.length} conexões ODBC`);

  if (!prev) {
    if (host.systems.length) {
      console.log(ui.bold("\n  Sistemas reconhecidos:"));
      for (const s of host.systems) console.log(`   - ${s.systemName} ${ui.dim(`(${categoryLabel(s.category)}; certeza ${confidenceLabel(s.confidence)})`)}`);
    }
  } else {
    printComparison(prev.collectedAt, comparison!.changes);
  }

  for (const w of host.warnings) console.log(ui.yellow(`  ! ${w}`));
  console.log(`\n  ${added} nova(s) pendência(s) para confirmar com pessoas.`);
  if (refreshed.regenerated.length) console.log(ui.dim(`  Atualizado: ${refreshed.regenerated.join(", ")}`));
  if (refreshed.unchanged.length) console.log(ui.dim(`  Sem alteração (não regenerado): ${refreshed.unchanged.join(", ")}`));
  return true;
}

function printComparison(prevAt: string, changes: Array<{ importance: string; summary: string }>): void {
  const when = new Date(prevAt).toLocaleString("pt-BR");
  if (changes.length === 0) {
    console.log(ui.green(`\n  Nada mudou desde a análise anterior (${when}).`));
    return;
  }
  const n = (imp: string) => changes.filter((c) => c.importance === imp).length;
  console.log(ui.bold(`\n  Mudanças desde a análise anterior (${when}):`));
  console.log(`  ${n("alta")} importante(s) · ${n("media")} moderada(s) · ${n("baixa")} de rotina`);
  const shown = changes.filter((c) => c.importance !== "baixa");
  for (const c of shown.slice(0, 12)) console.log(`   ${c.importance === "alta" ? ui.yellow("!") : "-"} ${c.summary}`);
  if (shown.length > 12) console.log(ui.dim(`   ... e mais ${shown.length - 12}. Veja todas no relatório.`));
}

export function listQuestions(ws: Workspace, all = false): number {
  const qs = ws.loadQuestions();
  const list = all ? qs : qs.filter((q) => q.status === "aberta");
  if (list.length === 0) {
    console.log(ui.green("\nNenhuma pendência aberta."));
    return 0;
  }
  const groups = new Map<string, typeof list>();
  for (const q of list) groups.set(q.topic, [...(groups.get(q.topic) ?? []), q]);
  for (const [topic, items] of groups) {
    console.log(ui.bold(`\n${topicLabel(topic)}`));
    for (const q of items) {
      const st = q.status === "aberta" ? "" : ui.dim(` [${q.status}${q.answer ? `: ${q.answer}` : ""}]`);
      console.log(`  • ${q.text}${q.askWho ? ui.dim(` (quem sabe: ${q.askWho})`) : ""}${st}`);
      if (q.context) console.log(ui.dim(`    Por que perguntamos: ${q.context}`));
    }
  }
  return list.length;
}

export async function answerQuestions(ws: Workspace): Promise<void> {
  const open = ws.loadQuestions().filter((q) => q.status === "aberta");
  if (open.length === 0) {
    console.log(ui.green("\nNenhuma pendência aberta."));
    return;
  }
  const p = Prompter.shared();
  console.log(ui.dim(`\n${open.length} pendência(s). Enter = pular · !descartar = não se aplica · !sair = voltar`));
  for (const q of open) {
    console.log(`\n${ui.bold(q.text)}${q.askWho ? ui.dim(` (quem sabe: ${q.askWho})`) : ""}`);
    if (q.context) console.log(ui.dim("  Por que perguntamos: " + q.context));
    const raw = await p.ask(ui.cyan("> "));
    if (raw === null || raw.trim() === "!sair") break;
    const t = raw.trim();
    if (!t) continue;
    const cur = ws.loadQuestions();
    const target = cur.find((x) => x.id === q.id)!;
    if (t === "!descartar") target.status = "descartada";
    else {
      target.status = "respondida";
      target.answer = t;
    }
    target.answeredAt = nowIso();
    ws.saveQuestions(cur);
  }
  writeReport(ws);
}
