/**
 * Ações de alto nível, compartilhadas pelo menu guiado e pelos comandos avançados.
 */
import { readFileSync } from "node:fs";
import { userInfo } from "node:os";
import { scanNetwork } from "./collectors/network/index.js";
import { analyzeNetwork, compareNetwork } from "./collectors/network/analyze.js";
import { expandAll } from "./collectors/network/ranges.js";
import { READERS, friendlyDbError, type DbTarget } from "./collectors/database/readers.js";
import { analyzeDatabase, compareDatabase, readDatabase } from "./collectors/database/index.js";
import { join } from "node:path";
import { Workspace, nowIso } from "./core/workspace.js";
import { decide, reviewItems, reviewSummary } from "./delivery/approvals.js";
import { SERVER_DIR, serverEnabled } from "./delivery/server.js";
import { Prompter } from "./core/prompt.js";
import { completedUpTo } from "./company/progress.js";
import { LEVELS, MIN_LEVEL_FOR_TECH_SCAN } from "./company/levels.js";
import { collectLocalHost } from "./collectors/host/index.js";
import { analyzeHost } from "./collectors/host/analyze.js";
import { compareHosts } from "./core/changes.js";
import { refreshArtifacts } from "./generation.js";
import { loadContext, missingInfo, planSkills, skillQuestions, skillsEnabled } from "./skills/index.js";
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
  const r = refreshArtifacts(ws);
  if (r.regenerated.length) console.log(ui.dim(`
Atualizado com as respostas: ${r.regenerated.join(", ")}`));
  writeReport(ws);
}

/** Etapa 4: aplica os modelos de skill e gera skills + guardrails (só o que mudou). */
export function buildAgentAction(ws: Workspace): boolean {
  if (!skillsEnabled(ws)) {
    const done = completedUpTo(ws.loadCompany());
    console.log(ui.yellow(`\nO agente só pode ser montado com a entrevista completa (concluído até o nível ${done} de ${LEVELS.length}).`));
    console.log(ui.dim("Motivo: o nível 6 define o que o agente pode e não pode fazer. Sem ele, não há como escrever regras de segurança."));
    return false;
  }
  const ctx = loadContext(ws);
  const added = ws.addQuestions(skillQuestions(ctx));
  const refreshed = refreshArtifacts(ws);
  writeReport(ws);

  const plans = planSkills(loadContext(ws));
  const ctx2 = loadContext(ws);
  console.log(ui.green(`\n✓ ${plans.length} skill(s) para o agente da ${ctx.name}:`));
  for (const kind of ["fixo", "adaptavel"] as const) {
    const group = plans.filter((p) => p.kind === kind);
    if (!group.length) continue;
    console.log(ui.bold(`\n  ${kind === "fixo" ? "Fixas (valem para qualquer empresa)" : "Adaptadas a esta empresa"}:`));
    for (const p of group) {
      const missing = missingInfo(ctx2, p).length;
      const tag = missing ? ui.yellow(`${missing} informação(ões) faltando`) : ui.green("completa");
      const v = ws.loadManifest().artifacts[p.path]?.version ?? 0;
      const state = refreshed.regenerated.includes(p.path) ? (v === 1 ? "nova" : `atualizada → v${v}`) : `v${v}, sem alteração`;
      console.log(`   - ${p.title}  ${ui.dim(`[${state}]`)}  ${tag}`);
      if (kind === "adaptavel") console.log(ui.dim(`     Por quê: ${p.why}`));
    }
  }
  for (const r of refreshed.removed) console.log(ui.yellow(`  - Removida (não se aplica mais): ${r}`));
  console.log(`\n  Arquivos em: ${ws.path("saida")}`);
  if (added) console.log(`  ${added} nova(s) pendência(s): informações que as skills precisam. Ao respondê-las, só as skills afetadas são refeitas.`);
  return true;
}

/** Etapa 5: o TI revisa item por item; o servidor MCP é montado só com o que foi aprovado. */
export async function reviewAction(ws: Workspace): Promise<boolean> {
  const items = reviewItems(ws);
  if (!items.some((i) => i.kind === "skill")) {
    console.log(ui.yellow("\nAinda não há o que revisar: primeiro monte o agente (etapa 4)."));
    return false;
  }
  const todo = items.filter((i) => i.status === "pendente" || i.status === "mudou");
  const p = Prompter.shared();

  if (todo.length) {
    console.log(ui.bold(`\n${todo.length} item(ns) para revisar.`));
    console.log(ui.dim("O agente só vai usar o que for aprovado aqui. Uma skill refeita depois continua na versão aprovada até ser revisada de novo."));
    console.log(ui.dim("a = aprovar · r = recusar · v = ver o conteúdo · Enter = decidir depois · !sair = parar"));
    let n = 0;
    for (const item of todo) {
      n++;
      const kind = { skill: "Skill", contexto: "Contexto", ferramenta: "Ferramenta" }[item.kind];
      const ver = item.kind === "ferramenta" ? "" : ` v${item.version}${item.approvedVersion ? ` (no ar: v${item.approvedVersion})` : ""}`;
      console.log(`\n${ui.dim(`[${n}/${todo.length}]`)} ${ui.bold(`${kind}: ${item.title}`)}${ui.dim(ver)}`);
      console.log(`  ${item.detail}`);
      if (item.status === "mudou") console.log(ui.yellow("  Mudou desde a última aprovação."));
      if (item.missing) console.log(ui.yellow(`  ${item.missing} informação(ões) ainda "a definir": nesses pontos o agente vai dizer que não sabe.`));
      if (item.sourcePath) console.log(ui.dim(`  Arquivo: ${ws.path(item.sourcePath)}`));

      let stop = false;
      for (;;) {
        const raw = await p.ask(ui.cyan("> "));
        if (raw === null || raw.trim() === "!sair") {
          stop = true;
          break;
        }
        const t = raw.trim().toLowerCase();
        if (t === "v" && item.sourcePath) {
          console.log(ui.dim("─".repeat(60)));
          console.log(readFileSync(ws.path(item.sourcePath), "utf8").trim());
          console.log(ui.dim("─".repeat(60)));
          continue;
        }
        if (t === "a" || t === "r") {
          decide(ws, item, t === "a" ? "aprovado" : "recusado");
          console.log(t === "a" ? ui.green("  ✓ aprovado") : ui.yellow("  ✗ recusado"));
        }
        break;
      }
      if (stop) break;
    }
  }

  const refreshed = refreshArtifacts(ws);
  writeReport(ws);
  const s = reviewSummary(reviewItems(ws));
  console.log(ui.bold(`\nRevisão: ${s.approved} aprovado(s) · ${s.rejected} recusado(s) · ${s.waiting} aguardando`));
  if (serverEnabled(ws)) {
    const dir = ws.path(SERVER_DIR);
    console.log(ui.green(`\n✓ Servidor MCP ${refreshed.regenerated.includes(SERVER_DIR) ? "atualizado" : "pronto"}: ${dir}`));
    console.log(`  Próximos passos: abra ${ui.bold(join(dir, "LEIA-ME.md"))}`);
    console.log("  1. Instale (dois cliques em instalar.bat)   2. Cole a configuração no Claude Desktop   3. Reinicie o Claude");
  } else {
    console.log(ui.dim("\nO servidor MCP é montado quando ao menos uma ferramenta for aprovada."));
  }
  return true;
}

export interface NetworkScanRequest {
  ranges: string[];
  extraPorts?: number[];
  /**
   * Confirmação de que o responsável pela rede autorizou a varredura destas faixas.
   * Sem ela, nada é varrido: não existe padrão "sim".
   */
  authorized: boolean;
}

/** Etapa 2 (rede): varre SOMENTE as faixas autorizadas e registra quem varreu, quando e o quê. */
export async function scanNetworkAction(ws: Workspace, req: NetworkScanRequest): Promise<boolean> {
  const done = completedUpTo(ws.loadCompany());
  if (done < MIN_LEVEL_FOR_TECH_SCAN) {
    console.log(ui.yellow(`\nA varredura de rede é liberada depois dos níveis 1 a ${MIN_LEVEL_FOR_TECH_SCAN} da entrevista.`));
    return false;
  }
  if (!req.authorized) {
    console.log(ui.yellow("\nVarredura cancelada: é preciso confirmar a autorização do responsável pela rede."));
    return false;
  }
  const ips = expandAll(req.ranges);
  const scope = new Set(ips);
  console.log(`\nVarrendo ${ips.length} endereço(s) em ${req.ranges.join(", ")}. Somente leitura, velocidade limitada.`);

  let lastPct = -1;
  const result = await scanNetwork(req.ranges, {
    extraPorts: req.extraPorts,
    onProgress: (phase, d, total) => {
      const pct = Math.floor((d / Math.max(total, 1)) * 100);
      if (process.stdout.isTTY) process.stdout.write(`\r  ${phase}: ${pct}%   `);
      else if (pct % 25 === 0 && pct !== lastPct) console.log(`  ${phase}: ${pct}%`);
      lastPct = pct;
      if (process.stdout.isTTY && d === total) process.stdout.write("\n");
    },
  });

  // Liga equipamentos a máquinas já analisadas localmente (mesmo IP).
  const inv = ws.loadInventory();
  for (const d of result.devices) {
    const h = inv.hosts.find((x) => x.interfaces.some((i) => i.ipv4.includes(d.ip)));
    if (h) d.hostId = h.id;
  }

  // Mudanças só dentro das faixas varridas; equipamentos de outras faixas ficam como estavam.
  const prev = inv.network.devices;
  const hadScan = prev.some((d) => scope.has(d.ip));
  const comparison = compareNetwork(prev, result.devices, scope);
  if (hadScan) ws.appendChanges(comparison.changes);
  for (const d of result.devices) {
    const old = prev.find((p) => p.ip === d.ip);
    if (old) d.firstSeen = old.firstSeen;
  }
  inv.network.devices = [...prev.filter((d) => !scope.has(d.ip)), ...result.devices];
  inv.network.scans.push({
    at: nowIso(),
    ranges: req.ranges,
    addresses: result.addresses,
    ports: result.ports,
    by: userInfo().username,
    authorized: true,
    durationMs: result.durationMs,
    devicesFound: result.devices.length,
  });
  ws.saveInventory(inv);

  const added = ws.addQuestions([...(hadScan ? comparison.questions : []), ...analyzeNetwork(result.devices, ws.loadCompany())]);
  const refreshed = refreshArtifacts(ws);
  writeReport(ws);

  console.log(ui.green(`\n✓ ${result.devices.length} equipamento(s) encontrado(s) em ${Math.round(result.durationMs / 1000)}s`));
  const kinds = new Map<string, number>();
  for (const d of result.devices) kinds.set(d.kind, (kinds.get(d.kind) ?? 0) + 1);
  for (const [k, n] of [...kinds].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)} × ${k}`);
  const systems = [...new Set(result.devices.flatMap((d) => d.systems.map((s) => s.systemName)))];
  if (systems.length) console.log(ui.bold(`\n  Sistemas reconhecidos: `) + systems.join(", "));
  if (hadScan) printComparison(prev.filter((d) => scope.has(d.ip)).map((d) => d.lastSeen).sort().at(-1) ?? nowIso(), comparison.changes);
  console.log(`\n  ${added} nova(s) pendência(s) para confirmar com pessoas.`);
  if (refreshed.regenerated.length) console.log(ui.dim(`  Atualizado: ${refreshed.regenerated.join(", ")}`));
  return true;
}

export interface DatabaseReadRequest {
  target: DbTarget;
  /** Bancos a ler; vazio = todos os que o usuário enxerga (até 20). */
  databases?: string[];
}

/** Lista os bancos disponíveis no servidor (para a pessoa escolher). */
export async function listServerDatabases(target: DbTarget): Promise<string[]> {
  return READERS[target.engine].listDatabases(target);
}

/**
 * Etapa 2 (bancos): lê a ESTRUTURA de um ou mais bancos. A senha só existe em memória.
 * Grava: resumo no inventário + estrutura completa em bancos/<id>.json.
 */
export async function readDatabasesAction(ws: Workspace, req: DatabaseReadRequest): Promise<boolean> {
  const done = completedUpTo(ws.loadCompany());
  if (done < MIN_LEVEL_FOR_TECH_SCAN) {
    console.log(ui.yellow(`\nA leitura de bancos é liberada depois dos níveis 1 a ${MIN_LEVEL_FOR_TECH_SCAN} da entrevista.`));
    return false;
  }
  const t = req.target;
  let names: string[];
  try {
    names = req.databases?.length ? req.databases : await listServerDatabases(t);
  } catch (e) {
    console.log(ui.red(`
Não foi possível conectar: ${friendlyDbError(e)}`));
    return false;
  }
  if (names.length > 20) {
    console.log(ui.yellow(`  O servidor tem ${names.length} bancos; lendo os 20 primeiros. Para escolher, informe os nomes.`));
    names = names.slice(0, 20);
  }
  if (!names.length) {
    console.log(ui.yellow("  Nenhum banco acessível com esse usuário."));
    return false;
  }

  const questions: Parameters<typeof ws.addQuestions>[0] = [];
  let ok = 0;
  for (const name of names) {
    process.stdout.write(`  Lendo a estrutura de "${name}"... `);
    try {
      const next = await readDatabase(t, name);
      const inv = ws.loadInventory();
      const prevSummary = inv.databases.find((d) => d.id === next.summary.id);
      if (prevSummary) {
        const prevStructure = ws.loadDbStructure(prevSummary.structureFile);
        const cmp = compareDatabase({ summary: prevSummary, structure: prevStructure }, next);
        ws.appendChanges(cmp.changes);
        questions.push(...cmp.questions);
      }
      ws.saveDbStructure(next.summary.structureFile, next.structure);
      inv.databases = [...inv.databases.filter((d) => d.id !== next.summary.id), next.summary];
      ws.saveInventory(inv);
      questions.push(...analyzeDatabase(next.summary));
      ok++;
      const s = next.summary;
      console.log(ui.green("ok"));
      console.log(ui.dim(`    ${s.tables} tabelas, ${s.views} views${s.areas.length ? ` · áreas: ${s.areas.join(", ")}` : ""}${s.systems.length ? ` · sistema: ${s.systems.map((x) => x.systemName).join(", ")}` : ""}${s.sensitive.length ? ` · ${s.sensitive.length} coluna(s) sensível(is)` : ""}`));
    } catch (e) {
      console.log(ui.red(`falhou: ${friendlyDbError(e)}`));
    }
  }
  const added = ws.addQuestions(questions);
  const refreshed = refreshArtifacts(ws);
  writeReport(ws);
  console.log(ui.green(`\n✓ ${ok} de ${names.length} banco(s) lido(s). Somente a estrutura: nenhuma linha de dados foi lida.`));
  console.log(`  ${added} nova(s) pendência(s).`);
  if (refreshed.regenerated.length) console.log(ui.dim(`  Atualizado: ${refreshed.regenerated.join(", ")}`));
  return ok > 0;
}
