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
import { readDatabasesAction, scanHostAction, scanNetworkAction, listQuestions, answerQuestions, buildAgentAction, reviewAction } from "./actions.js";
import { writeReport } from "./report/html.js";
import { guided, openFile } from "./guided.js";
import { listQueriesText, queryWizard, removeQuery } from "./queries/wizard.js";
import { refreshArtifacts } from "./generation.js";
import { DEFAULT_PORT, type Engine } from "./collectors/database/readers.js";

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

scan
  .command("rede")
  .description("varre faixas de rede AUTORIZADAS em busca de equipamentos e serviços (somente leitura)")
  .requiredOption("--faixa <faixas...>", "faixas a varrer: 192.168.1.0/24, 192.168.1.10-50 ou um IP")
  .option("--portas <lista>", "portas extras, separadas por vírgula (ex.: 8085,9000)")
  .option("--autorizado", "confirma que o responsável pela rede autorizou esta varredura (obrigatório)")
  .action(async (opts: { faixa: string[]; portas?: string; autorizado?: boolean }) => {
    if (!opts.autorizado) {
      console.log(ui.yellow("Por segurança, informe --autorizado para confirmar que o responsável pela rede autorizou a varredura destas faixas."));
      process.exitCode = 1;
      return;
    }
    const extraPorts = opts.portas?.split(",").map((p) => Number(p.trim())).filter((p) => Number.isInteger(p) && p > 0 && p < 65536);
    const ok = await scanNetworkAction(ws(), { ranges: opts.faixa, extraPorts, authorized: true });
    if (!ok) process.exitCode = 1;
  });

scan
  .command("banco")
  .description("lê a ESTRUTURA (tabelas, colunas) de bancos SQL Server ou PostgreSQL; nenhum dado é lido")
  .requiredOption("--motor <motor>", "sqlserver ou postgres")
  .requiredOption("--host <host>", "endereço do servidor")
  .option("--porta <n>", "porta (padrão: 1433 ou 5432)", (v) => Number(v))
  .requiredOption("--usuario <usuario>", "usuário com permissão de leitura")
  .option("--bancos <lista>", "bancos a ler, separados por vírgula (padrão: todos, até 20)")
  .action(async (opts: { motor: string; host: string; porta?: number; usuario: string; bancos?: string }) => {
    if (opts.motor !== "sqlserver" && opts.motor !== "postgres") {
      console.log(ui.yellow("Motor não suportado. Use sqlserver ou postgres."));
      process.exitCode = 1;
      return;
    }
    // A senha vem da variável de ambiente ou é pedida sem aparecer na tela. Nunca por argumento (ficaria no histórico).
    const password = process.env.MCP_BUILDER_DB_SENHA ?? (await Prompter.shared().askSecret("Senha (não aparece na tela e não é gravada): ")) ?? "";
    const engine = opts.motor as Engine;
    const ok = await readDatabasesAction(ws(), {
      target: { engine, host: opts.host, port: opts.porta ?? DEFAULT_PORT[engine], user: opts.usuario, password },
      databases: opts.bancos?.split(",").map((s) => s.trim()).filter(Boolean),
    });
    if (!ok) process.exitCode = 1;
  });

program
  .command("agente")
  .description("etapa 4: gera as skills e as regras de segurança do agente (só o que mudou)")
  .action(() => {
    if (!buildAgentAction(ws())) process.exitCode = 1;
  });

const consultas = program.command("consultas").description("consultas somente leitura que o agente pode fazer aos sistemas");
consultas
  .command("listar", { isDefault: true })
  .description("lista as consultas criadas")
  .action(() => listQueriesText(ws()));
consultas
  .command("nova")
  .description("cria uma consulta com o assistente (sem escrever SQL) ou com SQL próprio")
  .action(async () => {
    const w = ws();
    if (await queryWizard(w, Prompter.shared())) writeReport(w);
  });
consultas
  .command("remover")
  .argument("<id>", "identificador da consulta (o nome sem consultar_)")
  .description("remove uma consulta")
  .action((id: string) => {
    const w = ws();
    if (removeQuery(w, id)) {
      refreshArtifacts(w);
      writeReport(w);
      console.log(ui.green(`✓ Consulta ${id} removida.`));
    } else {
      console.log(ui.yellow(`Consulta ${id} não encontrada.`));
      process.exitCode = 1;
    }
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
