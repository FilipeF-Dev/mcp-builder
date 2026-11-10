#!/usr/bin/env node
/**
 * Ponto de entrada.
 *   - Sem argumentos: abre o MODO GUIADO (menu em linguagem simples), o uso recomendado.
 *   - Com argumentos: comandos avançados, para técnicos e automação.
 */
import { readFileSync } from "node:fs";
import { Command } from "commander";
import { Workspace } from "./core/workspace.js";
import { Prompter } from "./core/prompt.js";
import { ui } from "./core/ui.js";
import { computeStages, STATE_LABEL } from "./core/stages.js";
import { runInterview, importAnswers, printLevelSummary } from "./company/interview.js";
import { MIN_LEVEL_FOR_TECH_SCAN } from "./company/levels.js";
import { scanHostAction, listQuestions, answerQuestions, buildAgentAction, reviewAction } from "./actions.js";
import { writeReport } from "./report/html.js";
import { guided, openFile } from "./guided.js";

const program = new Command();
program
  .name("mcp-builder")
  .description("Prepara uma empresa para um agente de IA: entende o negócio, mapeia a tecnologia e gera a base de um servidor MCP.\nSem comandos, abre o modo guiado.")
  .version("0.1.0")
  .option("-e, --empresa <slug>", "pasta da empresa (opcional se houver só uma)")
  .action(() => guided());

const ws = () => Workspace.open(program.opts().empresa);

program
  .command("init")
  .argument("<nome>", "nome da empresa")
  .description("cria a pasta de uma empresa")
  .action((nome: string) => {
    const w = Workspace.create(nome);
    writeReport(w);
    console.log(ui.green(`✓ Criado em ${w.dir}`));
    console.log(`Próximo passo: ${ui.bold("mcp-builder entrevista")}`);
  });

program
  .command("entrevista")
  .description("etapa 1: entrevista de negócio em níveis (retoma de onde parou)")
  .option("-n, --nivel <n>", "executar apenas um nível", (v) => Number(v))
  .option("-r, --revisar", "revisar respostas já dadas")
  .option("-i, --importar <arquivo.json>", 'importar respostas de um JSON { "id": valor }')
  .action(async (opts: { nivel?: number; revisar?: boolean; importar?: string }) => {
    const w = ws();
    if (opts.importar) {
      const data = JSON.parse(readFileSync(opts.importar, "utf8")) as Record<string, unknown>;
      const { ok, errors } = importAnswers(w, data);
      console.log(ui.green(`✓ ${ok.length} resposta(s) importada(s).`));
      for (const e of errors) console.log(ui.yellow(`  ! ${e}`));
      printLevelSummary(w.loadCompany());
      return;
    }
    await runInterview(w, { level: opts.nivel, review: opts.revisar });
  });

const scan = program.command("scan").description("etapa 2: análise técnica (somente leitura)");
scan
  .command("host")
  .description("analisa este computador: sistema, programas, serviços, portas, tarefas, ODBC")
  .option("-f, --forcar", `ignorar a exigência de concluir os níveis 1–${MIN_LEVEL_FOR_TECH_SCAN} da entrevista`)
  .action(async (opts: { forcar?: boolean }) => {
    const ok = await scanHostAction(ws(), opts.forcar);
    if (!ok) process.exitCode = 1;
  });

program
  .command("agente")
  .description("etapa 4: gera as skills e as regras de segurança do agente (só o que mudou)")
  .action(() => {
    if (!buildAgentAction(ws())) process.exitCode = 1;
  });

program
  .command("revisar")
  .description("etapa 5: revisa e aprova skills, perfil e ferramentas; monta o servidor MCP")
  .action(async () => {
    if (!(await reviewAction(ws()))) process.exitCode = 1;
  });

program
  .command("perguntas")
  .description("etapa 3: lista ou responde as pendências")
  .option("-t, --todas", "incluir as já resolvidas")
  .option("-r, --responder", "responder agora")
  .action(async (opts: { todas?: boolean; responder?: boolean }) => {
    const w = ws();
    if (opts.responder) await answerQuestions(w);
    else listQuestions(w, opts.todas);
  });

program
  .command("relatorio")
  .description("gera o relatório de acompanhamento (HTML) e abre no navegador")
  .option("--nao-abrir", "só gerar, sem abrir")
  .action((opts: { naoAbrir?: boolean }) => {
    const path = writeReport(ws());
    console.log(`Relatório: ${path}`);
    if (!opts.naoAbrir) openFile(path);
  });

program
  .command("status")
  .description("mostra em que etapa a empresa está")
  .action(() => {
    const w = ws();
    console.log(ui.bold(`\n${w.loadCompany().name}`) + ui.dim(`  (${w.dir})`));
    for (const s of computeStages(w)) console.log(`  Etapa ${s.number}: ${s.title}  ${ui.dim(`[${STATE_LABEL[s.state]}] ${s.progress}`)}`);
    printLevelSummary(w.loadCompany());
  });

program
  .parseAsync()
  .catch((e: Error) => {
    console.error(`${ui.red("Erro:")} ${e.message}`);
    process.exitCode = 1;
  })
  .finally(() => Prompter.closeShared());
