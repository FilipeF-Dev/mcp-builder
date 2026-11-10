/**
 * MODO GUIADO: o jeito recomendado de usar o MCP-Builder.
 *
 * Um menu numerado em linguagem simples, que mostra em que etapa a empresa está
 * e sugere o próximo passo. Não exige saber nenhum comando.
 */
import { spawn } from "node:child_process";
import { platform, hostname } from "node:os";
import { Workspace, slugify } from "./core/workspace.js";
import { Prompter } from "./core/prompt.js";
import { ui } from "./core/ui.js";
import { computeStages, STATE_LABEL, type StageState } from "./core/stages.js";
import { runInterview } from "./company/interview.js";
import { completedUpTo } from "./company/progress.js";
import { LEVELS, MIN_LEVEL_FOR_TECH_SCAN } from "./company/levels.js";
import { listServerDatabases, readDatabasesAction, scanHostAction, scanNetworkAction, listQuestions, answerQuestions, buildAgentAction, reviewAction } from "./actions.js";
import { expandAll, localSubnets } from "./collectors/network/ranges.js";
import { DEFAULT_PORT, ENGINE_LABEL, friendlyDbError, type DbTarget, type Engine } from "./collectors/database/readers.js";
import { reviewItems } from "./delivery/approvals.js";
import { SKILLS_DIR } from "./skills/index.js";
import { writeReport } from "./report/html.js";

const ICON: Record<StageState, string> = {
  concluida: ui.green("✓"),
  "em-andamento": ui.yellow("…"),
  pendente: "○",
  bloqueada: ui.dim("○"),
  "em-breve": ui.dim("·"),
};

type Action = "entrevista" | "corrigir" | "scan" | "agente" | "aprovar" | "pendencias" | "relatorio";

/** Abre um arquivo no programa padrão (navegador, no caso do relatório). */
export function openFile(path: string): void {
  if (process.env.MCP_BUILDER_NO_OPEN) return;
  const os = platform();
  const [cmd, args] =
    os === "win32" ? ["cmd", ["/c", "start", "", path]] : os === "darwin" ? ["open", [path]] : ["xdg-open", [path]];
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
  } catch {
    /* sem navegador disponível: o caminho já é mostrado na tela */
  }
}

function recommended(ws: Workspace): { action: Action; label: string } {
  const company = ws.loadCompany();
  const done = completedUpTo(company);
  if (done < MIN_LEVEL_FOR_TECH_SCAN) return { action: "entrevista", label: `Entrevista sobre o negócio (nível ${done + 1})` };
  if (ws.loadInventory().hosts.length === 0) return { action: "scan", label: "Analisar este computador" };
  if (done < LEVELS.length) return { action: "entrevista", label: `Entrevista sobre o negócio (nível ${done + 1})` };
  const builtSkills = Object.keys(ws.loadManifest().artifacts).some((p) => p.startsWith(SKILLS_DIR + "/"));
  if (!builtSkills) return { action: "agente", label: "Montar o agente (gerar skills)" };
  if (reviewItems(ws).some((i) => i.status === "pendente" || i.status === "mudou")) return { action: "aprovar", label: "Revisar e aprovar (monta o servidor MCP)" };
  if (ws.loadQuestions().some((q) => q.status === "aberta")) return { action: "pendencias", label: "Responder pendências" };
  return { action: "relatorio", label: "Ver o relatório" };
}

async function chooseWorkspace(p: Prompter): Promise<Workspace | null> {
  const all = Workspace.list();
  if (all.length === 1) return Workspace.open(all[0]);

  if (all.length === 0) {
    console.log(ui.bold("\nBem-vindo ao MCP-Builder!"));
    console.log(
      [
        "",
        "Esta ferramenta prepara a sua empresa para ter um assistente de IA que ajuda",
        "os colaboradores com dúvidas e pequenos suportes no dia a dia.",
        "",
        "Funciona em etapas, do básico ao complexo:",
        "  1. Conhecer o negócio     (você responde uma entrevista)",
        "  2. Mapear a tecnologia    (a ferramenta analisa os computadores, só lendo)",
        "  3. Resolver pendências    (o que ela não entendeu, ela pergunta)",
        "  4. Montar o agente        (skills e regras de segurança)",
        "  5. Revisar e entregar     (o TI aprova; o servidor MCP é montado)",
        "",
        "Você pode parar a qualquer momento: tudo fica salvo.",
      ].join("\n"),
    );
    for (;;) {
      const name = await p.ask(ui.bold("\nPara começar, qual o nome da empresa? "));
      if (name === null) return null;
      if (name.trim()) {
        const ws = Workspace.create(name.trim());
        writeReport(ws);
        console.log(ui.green(`✓ Pronto! Os dados da empresa ficarão em: ${ws.dir}`));
        return ws;
      }
    }
  }

  console.log(ui.bold("\nQual empresa?"));
  all.forEach((s, i) => console.log(`  ${ui.cyan(String(i + 1))}. ${Workspace.open(s).loadCompany().name}`));
  console.log(`  ${ui.cyan("N")}. Nova empresa`);
  for (;;) {
    const raw = await p.ask("> ");
    if (raw === null) return null;
    const t = raw.trim().toLowerCase();
    if (t === "n") {
      const name = await p.ask("Nome da nova empresa: ");
      if (!name?.trim()) continue;
      return Workspace.create(name.trim());
    }
    const idx = Number(t);
    if (Number.isInteger(idx) && idx >= 1 && idx <= all.length) return Workspace.open(all[idx - 1]);
  }
}

function printStages(ws: Workspace): void {
  const company = ws.loadCompany();
  console.log("\n" + ui.bold(`━━ ${company.name} ━━`));
  for (const s of computeStages(ws)) {
    const line = `  ${ICON[s.state]} Etapa ${s.number}: ${s.title}`;
    const detail = s.state === "em-breve" ? STATE_LABEL[s.state] : s.progress;
    console.log(`${s.state === "em-breve" ? ui.dim(line) : line}  ${ui.dim(`(${detail})`)}`);
  }
}

function explainProcess(ws: Workspace): void {
  console.log(ui.bold("\nComo o MCP-Builder funciona"));
  for (const s of computeStages(ws)) {
    console.log(`\n${ui.bold(`Etapa ${s.number}: ${s.title}`)}  ${ui.dim(`[${STATE_LABEL[s.state]}]`)}`);
    console.log(`  O que é:          ${s.what}`);
    console.log(`  Por que agora:    ${s.why}`);
    console.log(`  O que você faz:   ${s.you}`);
  }
  console.log(ui.dim("\nGuia completo na pasta docs/ do projeto (comece por docs/01-comece-aqui.md)."));
}

async function run(ws: Workspace, action: Action, p: Prompter): Promise<void> {
  switch (action) {
    case "entrevista":
      await runInterview(ws);
      break;
    case "corrigir": {
      console.log(ui.bold("\nCorrigir respostas"));
      LEVELS.forEach((l) => console.log(`  ${ui.cyan(String(l.level))}. ${l.title}`));
      const raw = await p.ask("Qual nível? (Enter = voltar) > ");
      const n = Number(raw?.trim());
      if (!raw?.trim() || !LEVELS.some((l) => l.level === n)) return;
      console.log(ui.dim("Cada resposta atual será mostrada: Enter mantém, ou digite a nova."));
      await runInterview(ws, { level: n, review: true });
      break;
    }
    case "scan": {
      const done = completedUpTo(ws.loadCompany());
      if (done < MIN_LEVEL_FOR_TECH_SCAN) {
        console.log(ui.yellow(`\nA análise dos computadores é liberada depois dos níveis 1 a ${MIN_LEVEL_FOR_TECH_SCAN} da entrevista.`));
        console.log(ui.dim("Motivo: sem saber o ramo e como a empresa atua, não há como interpretar o que for encontrado."));
        console.log(`Escolha ${ui.bold("1. Continuar")} para seguir com a entrevista.`);
        return;
      }
      const analyzedHere = ws.loadInventory().hosts.some((h) => h.id === slugify(hostname()));
      const scans = ws.loadInventory().network.scans.length;
      console.log(ui.bold("\nMapear a tecnologia"));
      console.log(`  ${ui.cyan("1")}. ${analyzedHere ? "Atualizar a análise deste computador" : "Analisar este computador"}`);
      console.log(`  ${ui.cyan("2")}. ${scans ? "Varrer a rede de novo (mostra só o que mudou)" : "Varrer a rede da empresa"}`);
      console.log(`  ${ui.cyan("3")}. Ler a estrutura de um banco de dados`);
      const which = (await p.ask("Qual? (Enter = voltar) > "))?.trim();
      if (which === "2") {
        await networkFlow(ws, p);
        return;
      }
      if (which === "3") {
        await databaseFlow(ws, p);
        return;
      }
      if (which !== "1") return;
      console.log(ui.bold("\nAnalisar este computador"));
      console.log("A ferramenta vai LER (sem alterar nada): sistema operacional, programas instalados,");
      console.log("serviços, portas de rede abertas, tarefas agendadas e conexões com bancos de dados.");
      console.log(ui.dim("Senhas e chaves encontradas são ocultadas antes de gravar. Nada é enviado para a internet."));
      if (!(await p.confirm("Continuar?"))) return;
      try {
        await scanHostAction(ws);
      } catch (e) {
        console.log(ui.red(`\nNão foi possível analisar este computador: ${(e as Error).message}`));
      }
      break;
    }
    case "agente":
      console.log(ui.bold("\nMontar o agente"));
      console.log("Os modelos de skill vão escrever o que o agente sabe fazer e as regras que ele nunca pode quebrar.");
      console.log(ui.dim("Nada é enviado para a internet. O que faltar vira pendência para alguém responder."));
      buildAgentAction(ws);
      break;
    case "aprovar":
      console.log(ui.bold("\nRevisar e aprovar"));
      console.log("Cada skill, o perfil da empresa e cada ferramenta do servidor passam por você. O agente só usa o que for aprovado.");
      await reviewAction(ws);
      break;
    case "pendencias":
      if (listQuestions(ws) > 0 && (await p.confirm("\nResponder agora?"))) await answerQuestions(ws);
      break;
    case "relatorio": {
      const path = writeReport(ws);
      console.log(`\nRelatório atualizado: ${path}`);
      openFile(path);
      break;
    }
  }
}

/** Bancos que a ferramenta já conhece: achados na rede, nesta máquina ou lidos antes. */
function databaseCandidates(ws: Workspace): Array<{ engine: Engine; host: string; port: number; label: string }> {
  const inv = ws.loadInventory();
  const out = new Map<string, { engine: Engine; host: string; port: number; label: string }>();
  const add = (engine: Engine, host: string, port: number, label: string) => out.set(`${engine}|${host}|${port}`, { engine, host, port, label });
  for (const d of inv.databases) add(d.engine, d.host, d.port, `${ENGINE_LABEL[d.engine]} em ${d.host}:${d.port} ${ui.dim("(já lido antes)")}`);
  for (const d of inv.network.devices) {
    for (const s of d.services) {
      const engine: Engine | undefined = s.port === 1433 ? "sqlserver" : s.port === 5432 ? "postgres" : undefined;
      if (engine) add(engine, d.ip, s.port, `${ENGINE_LABEL[engine]} em ${d.hostname ?? d.ip}:${s.port} ${ui.dim("(encontrado na rede)")}`);
    }
  }
  for (const h of inv.hosts) {
    for (const s of h.systems) {
      if (s.signatureId === "sqlserver") add("sqlserver", "127.0.0.1", 1433, `SQL Server neste computador (${h.hostname})`);
      if (s.signatureId === "postgres") add("postgres", "127.0.0.1", 5432, `PostgreSQL neste computador (${h.hostname})`);
    }
  }
  return [...out.values()];
}

/** Leitura guiada da estrutura de um banco. A senha só existe em memória. */
async function databaseFlow(ws: Workspace, p: Prompter): Promise<void> {
  console.log(ui.bold("\nLer a estrutura de um banco de dados"));
  console.log("A ferramenta lê só a ESTRUTURA: nomes de tabelas, colunas e relacionamentos. Nenhum dado");
  console.log("(cliente, pedido, salário...) é lido. Com isso ela entende o que cada banco guarda e onde há");
  console.log("dados pessoais, que viram regras de segurança para o agente.");
  console.log(ui.dim("\nVocê vai precisar de um usuário do banco com permissão de leitura. O ideal é o TI criar um"));
  console.log(ui.dim("usuário só para isso (veja docs/04-analise-tecnica.md). A senha não é gravada em lugar nenhum."));
  console.log(ui.dim("Hoje: SQL Server e PostgreSQL. Outros bancos (Firebird, MySQL, Oracle) em próximas versões."));

  const candidates = databaseCandidates(ws);
  console.log(ui.bold("\nQual servidor de banco?"));
  candidates.forEach((c, i) => console.log(`  ${ui.cyan(String(i + 1))}. ${c.label}`));
  console.log(`  ${ui.cyan("D")}. Digitar o endereço`);
  let target: { engine: Engine; host: string; port: number } | undefined;
  for (;;) {
    const raw = (await p.ask("> "))?.trim();
    if (!raw) return;
    if (raw.toLowerCase() === "d") {
      const eng = (await p.ask(`Tipo: ${ui.cyan("1")}. SQL Server  ${ui.cyan("2")}. PostgreSQL > `))?.trim();
      const engine: Engine | undefined = eng === "1" ? "sqlserver" : eng === "2" ? "postgres" : undefined;
      if (!engine) continue;
      const host = (await p.ask("Endereço do servidor (nome ou IP): "))?.trim();
      if (!host) return;
      const portRaw = (await p.ask(`Porta (Enter = ${DEFAULT_PORT[engine]}): `))?.trim();
      target = { engine, host, port: portRaw ? Number(portRaw) : DEFAULT_PORT[engine] };
    } else {
      target = candidates[Number(raw) - 1];
    }
    if (target) break;
  }

  const user = (await p.ask("Usuário do banco: "))?.trim();
  if (!user) return;
  const password = (await p.askSecret("Senha (não aparece na tela e não é gravada): ")) ?? "";
  const full: DbTarget = { ...target, user, password };

  let available: string[];
  try {
    process.stdout.write("Conectando... ");
    available = await listServerDatabases(full);
    console.log(ui.green("ok"));
  } catch (e) {
    console.log(ui.red(`falhou: ${friendlyDbError(e)}`));
    return;
  }
  if (!available.length) {
    console.log(ui.yellow("Esse usuário não enxerga nenhum banco."));
    return;
  }
  console.log(ui.bold("\nQuais bancos ler?"));
  available.forEach((n, i) => console.log(`  ${ui.cyan(String(i + 1))}. ${n}`));
  const pick = (await p.ask(`Números separados por vírgula (Enter = todos${available.length > 20 ? ", até 20" : ""}): `))?.trim();
  const chosen = pick
    ? pick
        .split(/[,\s]+/)
        .map((x) => available[Number(x) - 1])
        .filter(Boolean)
    : available;
  if (!chosen.length) return;
  console.log();
  await readDatabasesAction(ws, { target: full, databases: chosen });
}

/** Varredura de rede guiada: escolha da faixa, estimativa e autorização digitada por extenso. */
async function networkFlow(ws: Workspace, p: Prompter): Promise<void> {
  console.log(ui.bold("\nVarrer a rede"));
  console.log("A ferramenta vai testar, em cada endereço da faixa escolhida, se existem serviços conhecidos");
  console.log("(banco de dados, e-mail, sites internos, compartilhamento de arquivos, impressoras...).");
  console.log(ui.dim("Somente leitura e com velocidade limitada: nenhuma senha é testada, nada é alterado."));
  console.log(ui.yellow("\nImportante: varrer uma rede exige autorização do responsável por ela. Avise também quem"));
  console.log(ui.yellow("cuida da segurança: ferramentas de monitoramento podem registrar a varredura."));

  const last = ws.loadInventory().network.scans.at(-1);
  const subnets = localSubnets().sort((a, b) => Number(a.virtual) - Number(b.virtual));
  const options: Array<{ label: string; ranges: string[] }> = [];
  if (last) options.push({ label: `Repetir a última varredura: ${last.ranges.join(", ")}`, ranges: last.ranges });
  for (const s of subnets) {
    options.push({
      label: `${s.cidr}  ${ui.dim(`(rede da placa "${s.interfaceName}", este computador é ${s.address}${s.virtual ? "; parece virtual" : ""})`)}`,
      ranges: [s.cidr],
    });
  }
  console.log(ui.bold("\nQual faixa?"));
  options.forEach((o, i) => console.log(`  ${ui.cyan(String(i + 1))}. ${o.label}`));
  console.log(`  ${ui.cyan("D")}. Digitar outra (ex.: 192.168.1.0/24, 10.0.0.10-50)`);

  let ranges: string[] | undefined;
  for (;;) {
    const raw = (await p.ask("> "))?.trim();
    if (!raw) return;
    if (raw.toLowerCase() === "d") {
      const typed = (await p.ask("Faixas (separe por vírgula): "))?.trim();
      if (!typed) return;
      ranges = typed.split(/[,;\s]+/).filter(Boolean);
    } else {
      ranges = options[Number(raw) - 1]?.ranges;
    }
    if (!ranges) continue;
    try {
      const n = expandAll(ranges).length;
      const est = Math.max(10, Math.round((n * 8 * 0.8) / 64 + 20));
      console.log(`\n${n} endereço(s). Tempo estimado: até ${est < 90 ? `${est} segundos` : `${Math.round(est / 60)} minutos`}.`);
      break;
    } catch (e) {
      console.log(ui.yellow((e as Error).message));
      ranges = undefined;
    }
  }

  const answer = (await p.ask(`Você tem AUTORIZAÇÃO do responsável pela rede para varrer ${ranges.join(", ")}? Digite ${ui.bold("autorizado")} para confirmar: `))
    ?.trim()
    .toLowerCase();
  const authorized = answer === "autorizado";
  if (!authorized) {
    console.log(ui.dim("Varredura cancelada. Nada foi feito."));
    return;
  }
  try {
    await scanNetworkAction(ws, { ranges, authorized });
  } catch (e) {
    console.log(ui.red(`\nNão foi possível varrer a rede: ${(e as Error).message}`));
  }
}

export async function guided(): Promise<void> {
  const p = Prompter.shared();
  const ws = await chooseWorkspace(p);
  if (!ws) return;

  for (;;) {
    printStages(ws);
    const rec = recommended(ws);
    console.log(ui.bold("\nO que você quer fazer?"));
    console.log(`  ${ui.cyan("1")}. ${ui.bold("Continuar")}: ${rec.label}  ${ui.green("← recomendado")}`);
    console.log(`  ${ui.cyan("2")}. Entrevista sobre o negócio`);
    console.log(`  ${ui.cyan("3")}. Mapear a tecnologia (computador, rede ou bancos)`);
    console.log(`  ${ui.cyan("4")}. Montar o agente (gerar skills)`);
    console.log(`  ${ui.cyan("5")}. Revisar e aprovar (servidor MCP)`);
    console.log(`  ${ui.cyan("6")}. Ver e responder pendências`);
    console.log(`  ${ui.cyan("7")}. Abrir o relatório no navegador`);
    console.log(`  ${ui.cyan("8")}. Corrigir respostas da entrevista`);
    console.log(`  ${ui.cyan("9")}. Como funciona?`);
    console.log(`  ${ui.cyan("0")}. Sair`);

    const raw = await p.ask("> ");
    if (raw === null) break;
    const choice = raw.trim();
    if (choice === "0" || choice.toLowerCase() === "sair") break;

    const map: Record<string, Action | "ajuda"> = { "1": rec.action, "2": "entrevista", "3": "scan", "4": "agente", "5": "aprovar", "6": "pendencias", "7": "relatorio", "8": "corrigir", "9": "ajuda" };
    const action = map[choice];
    if (!action) {
      console.log(ui.yellow("Digite o número de uma das opções."));
      continue;
    }
    if (action === "ajuda") explainProcess(ws);
    else await run(ws, action, p);
  }

  const path = writeReport(ws);
  console.log(`\nTudo salvo. O relatório de acompanhamento está em:\n  ${path}\nAté logo!`);
}
