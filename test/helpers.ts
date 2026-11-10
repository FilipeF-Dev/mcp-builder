/** Dados de exemplo compartilhados pelos testes. Tudo fictício. */
import { mkdtempSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Host } from "../src/core/schema.js";

/** Pasta temporária DENTRO do projeto: o servidor gerado acha o SDK do MCP no node_modules do projeto. */
export function tempDir(prefix: string): string {
  const base = join(process.cwd(), ".tmp-testes");
  mkdirSync(base, { recursive: true });
  return mkdtempSync(join(base, `${prefix}-`));
}

export function makeHost(overrides: Partial<Host> = {}): Host {
  return {
    id: "srv-teste",
    hostname: "SRV-TESTE",
    collectedAt: "2026-01-01T00:00:00.000Z",
    collector: "teste",
    os: { family: "windows", name: "Windows Server 2022", version: "10.0.20348" },
    role: "servidor",
    interfaces: [{ name: "Ethernet", ipv4: ["10.0.0.10"] }],
    software: [],
    services: [],
    listeningPorts: [],
    scheduledTasks: [],
    dataSources: [],
    systems: [],
    warnings: [],
    ...overrides,
  };
}

/** Respostas completas da entrevista (6 níveis) de uma empresa fictícia. */
export const ANSWERS = {
  ramo: 1,
  segmento: "Refeições coletivas",
  o_que_faz: "Refeições para refeitórios corporativos",
  colaboradores: 3,
  sede: "Campinas/SP",
  modelo: 1,
  clientes: "Indústrias",
  canais: "5",
  unidades_tipos: "2,5",
  unidades_qtd: 12,
  cadeia_valor: "Contrato > cardápio > compras > produção > entrega",
  horarios_criticos: "Dias úteis 9h-14h",
  areas: "Operações; Compras; RH; TI",
  usuarios_agente: "Operações; RH",
  familiaridade: 1,
  ti_estrutura: "1 analista + terceirizada",
  processos: "Compra de insumos; Fechamento de cardápio",
  duvidas_frequentes: "Como lançar requisição; Onde vejo meu holerite",
  chamados_comuns: "Esqueci a senha; Impressora",
  ferramenta_chamados: "GLPI",
  erp: "Teknisa",
  migracoes: "Teknisa será substituído pelo Touch",
  outros_sistemas: "E-mail; Ponto",
  hospedagem: 3,
  objetivo: "Reduzir chamados simples",
  pode_fazer: "Explicar procedimentos; Ajudar a abrir chamado",
  nao_pode: "Alterar dados no ERP; Informar salários",
  dados_sensiveis: "Salários; Dados de clientes",
  aprovador: "Gerente de TI",
  canal: "1",
  tom: 2,
};

/**
 * Monta uma empresa fictícia completa num workspace temporário: entrevista, um servidor analisado
 * (Teknisa, GLPI, Exchange) e um banco lido. Os módulos são importados DEPOIS de definir
 * MCP_BUILDER_HOME, porque a pasta dos workspaces é lida ao carregar o módulo.
 */
export async function prepararEmpresa(prefix: string) {
  process.env.MCP_BUILDER_HOME = tempDir(prefix);
  const { Workspace } = await import("../src/core/workspace.js");
  const { importAnswers } = await import("../src/company/interview.js");
  const ws = Workspace.create("Empresa Teste");
  const r = importAnswers(ws, ANSWERS);
  if (r.errors.length) throw new Error(`respostas inválidas: ${r.errors.join("; ")}`);
  const inv = ws.loadInventory();
  inv.hosts.push(
    makeHost({
      software: [{ name: "Teknisa Sistemas Integrados" }, { name: "GLPI Agent 1.4" }],
      services: [{ name: "glpi-agent", displayName: "GLPI Agent", state: "Running" }],
      systems: [
        { signatureId: "teknisa", systemName: "Teknisa", category: "erp", confidence: "media", evidence: ["programa"] },
        { signatureId: "glpi", systemName: "GLPI (chamados)", category: "negocio", confidence: "alta", evidence: ["programa"] },
        { signatureId: "exchange", systemName: "Microsoft Exchange Server", category: "email", confidence: "alta", evidence: ["serviço"] },
      ],
    }),
  );
  inv.databases.push({
    id: "postgres-db-5432-erp",
    engine: "postgres",
    host: "db",
    port: 5432,
    database: "erp",
    collectedAt: "2026-01-01T00:00:00.000Z",
    by: "teste",
    dbUser: "mcp_leitura",
    tables: 2,
    views: 0,
    routines: 0,
    largestTables: [],
    areas: ["clientes"],
    systems: [],
    sensitive: [{ column: "public.clientes.cpf", kind: "CPF" }],
    structureFile: "bancos/postgres-db-5432-erp.json",
  });
  ws.saveInventory(inv);
  return ws;
}
