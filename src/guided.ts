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
import { scanHostAction, listQuestions, answerQuestions, buildAgentAction } from "./actions.js";
import { SKILLS_DIR } from "./skills/index.js";
import { writeReport } from "./report/html.js";

const ICON: Record<StageState, string> = {
  concluida: ui.green("✓"),
  "em-andamento": ui.yellow("…"),
  pendente: "○",
  bloqueada: ui.dim("○"),
  "em-breve": ui.dim("·"),
};

type Action = "entrevista" | "revisar" | "scan" | "agente" | "pendencias" | "relatorio";

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
        "  5. Revisar e entregar     (em breve)",
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
    case "revisar": {
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
    const analyzed = ws.loadInventory().hosts.some((h) => h.id === slugify(hostname()));
    console.log(`  ${ui.cyan("3")}. ${analyzed ? "Atualizar a análise deste computador (mostra só o que mudou)" : "Analisar este computador"}`);
    console.log(`  ${ui.cyan("4")}. Montar o agente (gerar skills)`);
    console.log(`  ${ui.cyan("5")}. Ver e responder pendências`);
    console.log(`  ${ui.cyan("6")}. Abrir o relatório no navegador`);
    console.log(`  ${ui.cyan("7")}. Corrigir respostas da entrevista`);
    console.log(`  ${ui.cyan("8")}. Como funciona?`);
    console.log(`  ${ui.cyan("0")}. Sair`);

    const raw = await p.ask("> ");
    if (raw === null) break;
    const choice = raw.trim();
    if (choice === "0" || choice.toLowerCase() === "sair") break;

    const map: Record<string, Action | "ajuda"> = { "1": rec.action, "2": "entrevista", "3": "scan", "4": "agente", "5": "pendencias", "6": "relatorio", "7": "revisar", "8": "ajuda" };
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
