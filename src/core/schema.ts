import { z } from "zod";

/**
 * Modelo de dados do MCP-Builder.
 *
 * O conhecimento sobre a empresa é organizado em CAMADAS, do básico ao complexo:
 *   1. Negócio  (company.json)   — ramo, como atua, estrutura, processos, sistemas percebidos, objetivos do agente
 *   2. Técnico  (inventory.json) — hosts, programas, serviços, rede, bancos...
 *   3. Lacunas  (questions.json) — tudo que a ferramenta não conseguiu deduzir e precisa perguntar
 *
 * A camada técnica só é interpretada à luz da camada de negócio.
 */

// ───────────────────────── Perguntas pendentes ─────────────────────────

export const QuestionSchema = z.object({
  id: z.string(),
  /** Camada a que a dúvida pertence: "negocio" ou "tecnico". */
  layer: z.enum(["negocio", "tecnico"]),
  /** Assunto curto para agrupar (ex.: "host:SRV01", "nivel-2"). */
  topic: z.string(),
  text: z.string(),
  /** O que levou a ferramenta a perguntar (evidência). */
  context: z.string().optional(),
  /** Quem gerou a pergunta (entrevista, coletor de host...). */
  source: z.string(),
  /** Quem provavelmente sabe responder (TI, Financeiro, Diretoria...). */
  askWho: z.string().optional(),
  status: z.enum(["aberta", "respondida", "descartada"]),
  answer: z.string().optional(),
  createdAt: z.string(),
  answeredAt: z.string().optional(),
});
export type Question = z.infer<typeof QuestionSchema>;

// ───────────────────────── Camada de negócio ─────────────────────────

export const AnswerSchema = z.object({
  value: z.union([z.string(), z.number(), z.array(z.string())]),
  answeredAt: z.string(),
});
export type Answer = z.infer<typeof AnswerSchema>;

export const CompanyProfileSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string(),
  slug: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Respostas por id de pergunta da entrevista (ver company/levels.ts). */
  answers: z.record(z.string(), AnswerSchema),
  /** Perguntas que o entrevistado marcou como "não sei / perguntar a outra pessoa". */
  deferred: z.array(z.string()),
});
export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;

// ───────────────────────── Camada técnica ─────────────────────────

export const SoftwareSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  publisher: z.string().optional(),
  installDate: z.string().optional(),
  installLocation: z.string().optional(),
});
export type Software = z.infer<typeof SoftwareSchema>;

export const ServiceSchema = z.object({
  name: z.string(),
  displayName: z.string().optional(),
  state: z.string().optional(),
  startMode: z.string().optional(),
  /** Executável/linha de comando, já com segredos mascarados. */
  command: z.string().optional(),
  account: z.string().optional(),
});
export type Service = z.infer<typeof ServiceSchema>;

export const ListeningPortSchema = z.object({
  protocol: z.enum(["tcp", "udp"]),
  address: z.string(),
  port: z.number(),
  process: z.string().optional(),
  pid: z.number().optional(),
});
export type ListeningPort = z.infer<typeof ListeningPortSchema>;

export const ScheduledTaskSchema = z.object({
  name: z.string(),
  path: z.string().optional(),
  state: z.string().optional(),
  /** Ação executada, com segredos mascarados. */
  action: z.string().optional(),
  runAs: z.string().optional(),
});
export type ScheduledTask = z.infer<typeof ScheduledTaskSchema>;

export const DataSourceSchema = z.object({
  /** ODBC DSN, connection string encontrada etc. */
  kind: z.string(),
  name: z.string(),
  driver: z.string().optional(),
  details: z.string().optional(),
});
export type DataSource = z.infer<typeof DataSourceSchema>;

export const NetworkInterfaceSchema = z.object({
  name: z.string(),
  ipv4: z.array(z.string()),
  prefixLength: z.number().optional(),
});

export const SystemMatchSchema = z.object({
  /** Id da assinatura (signatures/catalog.ts). */
  signatureId: z.string(),
  systemName: z.string(),
  category: z.string(),
  confidence: z.enum(["baixa", "media", "alta"]),
  evidence: z.array(z.string()),
});
export type SystemMatch = z.infer<typeof SystemMatchSchema>;

export const HostSchema = z.object({
  id: z.string(),
  hostname: z.string(),
  collectedAt: z.string(),
  collector: z.string(),
  os: z.object({
    family: z.enum(["windows", "linux", "outro"]),
    name: z.string(),
    version: z.string().optional(),
    architecture: z.string().optional(),
  }),
  hardware: z
    .object({
      manufacturer: z.string().optional(),
      model: z.string().optional(),
      cpu: z.string().optional(),
      cpuCores: z.number().optional(),
      memoryGB: z.number().optional(),
    })
    .optional(),
  domain: z.string().optional(),
  role: z.string().optional(),
  interfaces: z.array(NetworkInterfaceSchema),
  software: z.array(SoftwareSchema),
  services: z.array(ServiceSchema),
  listeningPorts: z.array(ListeningPortSchema),
  scheduledTasks: z.array(ScheduledTaskSchema),
  dataSources: z.array(DataSourceSchema),
  systems: z.array(SystemMatchSchema),
  warnings: z.array(z.string()),
});
export type Host = z.infer<typeof HostSchema>;

// ───────────────────────── Rede ─────────────────────────

export const NetServiceSchema = z.object({
  port: z.number(),
  /** Nome do serviço pelo catálogo de portas (ex.: "SQL Server"). */
  name: z.string(),
  category: z.string(),
  /** Primeira linha que o serviço apresenta, ou cabeçalho "Server" / título HTTP. Já mascarado. */
  banner: z.string().optional(),
});
export type NetService = z.infer<typeof NetServiceSchema>;

export const NetDeviceSchema = z.object({
  ip: z.string(),
  hostname: z.string().optional(),
  mac: z.string().optional(),
  /** Tipo provável, deduzido das portas (ex.: "impressora", "servidor de banco de dados"). */
  kind: z.string(),
  services: z.array(NetServiceSchema),
  systems: z.array(SystemMatchSchema),
  /** Máquina já analisada localmente com o mesmo IP. */
  hostId: z.string().optional(),
  firstSeen: z.string(),
  lastSeen: z.string(),
});
export type NetDevice = z.infer<typeof NetDeviceSchema>;

/** Registro de cada varredura: o que foi varrido, por quem, com qual autorização. */
export const NetScanSchema = z.object({
  at: z.string(),
  ranges: z.array(z.string()),
  addresses: z.number(),
  ports: z.array(z.number()),
  by: z.string(),
  /** A pessoa confirmou ter autorização do responsável pela rede. */
  authorized: z.literal(true),
  durationMs: z.number(),
  devicesFound: z.number(),
});
export type NetScan = z.infer<typeof NetScanSchema>;

export const NetworkSchema = z.object({
  scans: z.array(NetScanSchema),
  devices: z.array(NetDeviceSchema),
});
export type Network = z.infer<typeof NetworkSchema>;

// ───────────────────────── Bancos de dados ─────────────────────────

/** Estrutura completa de um banco (arquivo bancos/<id>.json). Só estrutura: nenhuma linha de dados. */
export const DbColumnSchema = z.object({ name: z.string(), type: z.string(), nullable: z.boolean() });
export const DbTableSchema = z.object({
  schema: z.string(),
  name: z.string(),
  kind: z.enum(["tabela", "view"]),
  /** Estimativa de linhas pelas estatísticas do banco (sem ler as linhas). */
  approxRows: z.number().optional(),
  columns: z.array(DbColumnSchema),
  primaryKey: z.array(z.string()),
});
export type DbTable = z.infer<typeof DbTableSchema>;
export const DbForeignKeySchema = z.object({ from: z.string(), to: z.string() });
export const DbStructureSchema = z.object({
  id: z.string(),
  tables: z.array(DbTableSchema),
  foreignKeys: z.array(DbForeignKeySchema),
  routines: z.array(z.string()),
});
export type DbStructure = z.infer<typeof DbStructureSchema>;

export const SensitiveColumnSchema = z.object({
  /** schema.tabela.coluna */
  column: z.string(),
  /** Tipo de dado sensível (CPF, salário, senha...). */
  kind: z.string(),
});
export type SensitiveColumn = z.infer<typeof SensitiveColumnSchema>;

/** Resumo de um banco no inventário. */
export const DatabaseSchema = z.object({
  id: z.string(),
  engine: z.enum(["sqlserver", "postgres"]),
  host: z.string(),
  port: z.number(),
  database: z.string(),
  serverVersion: z.string().optional(),
  collectedAt: z.string(),
  /** Usuário do sistema operacional que fez a leitura (a credencial do banco nunca é gravada). */
  by: z.string(),
  /** Usuário de banco usado (só o nome, nunca a senha). */
  dbUser: z.string(),
  tables: z.number(),
  views: z.number(),
  routines: z.number(),
  /** Maiores tabelas pela estimativa de linhas: indicam o coração do sistema. */
  largestTables: z.array(z.object({ name: z.string(), approxRows: z.number() })),
  /** Áreas de negócio que a estrutura sugere (clientes, pedidos, estoque, RH...). */
  areas: z.array(z.string()),
  systems: z.array(SystemMatchSchema),
  sensitive: z.array(SensitiveColumnSchema),
  structureFile: z.string(),
});
export type Database = z.infer<typeof DatabaseSchema>;

export const InventorySchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.string(),
  hosts: z.array(HostSchema),
  /** Opcional para manter compatibilidade com inventários criados antes do coletor de rede. */
  network: NetworkSchema.default({ scans: [], devices: [] }),
  databases: z.array(DatabaseSchema).default([]),
});
export type Inventory = z.infer<typeof InventorySchema>;

// ───────────────────────── Mudanças (atualização incremental) ─────────────────────────

/**
 * Uma mudança detectada entre duas análises (ou entre duas versões de uma resposta da entrevista).
 * O arquivo changes.json é um DIÁRIO: só cresce, nunca é reescrito.
 */
export const ChangeSchema = z.object({
  id: z.string(),
  at: z.string(),
  layer: z.enum(["negocio", "tecnico"]),
  /** Onde mudou: "host:SRV01", "entrevista". */
  subject: z.string(),
  kind: z.enum(["adicionado", "removido", "alterado"]),
  /** Tipo de coisa que mudou: sistema, programa, serviço, porta, tarefa, odbc, rede, sistema-operacional, resposta. */
  area: z.string(),
  item: z.string(),
  before: z.string().optional(),
  after: z.string().optional(),
  /** alta = muda o que o agente sabe ou pode fazer; baixa = atualização de rotina. */
  importance: z.enum(["alta", "media", "baixa"]),
  summary: z.string(),
  /** Fatos afetados (ver core/facts.ts). Usados para saber o que precisa ser regenerado. */
  factKeys: z.array(z.string()),
});
export type Change = z.infer<typeof ChangeSchema>;

// ───────────────────────── Manifesto do que foi gerado ─────────────────────────

/**
 * Para cada arquivo gerado (contexto, e no futuro skills e guardrails), registra
 * DE QUAIS FATOS ele depende e a "impressão digital" desses fatos no momento da geração.
 * Se a impressão digital mudar, o arquivo está desatualizado e só ele é regenerado.
 */
export const ArtifactSchema = z.object({
  path: z.string(),
  /** Prefixos de chaves de fatos (ex.: "empresa:", "host:srv01:sistema:"). */
  dependsOn: z.array(z.string()),
  fingerprint: z.string(),
  generatedAt: z.string(),
  /** Quantas vezes já foi gerado. */
  version: z.number(),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

export const ManifestSchema = z.object({
  schemaVersion: z.literal(1),
  artifacts: z.record(z.string(), ArtifactSchema),
});
export type Manifest = z.infer<typeof ManifestSchema>;

// ───────────────────────── Aprovações (etapa 5) ─────────────────────────

/**
 * Decisões do TI sobre o que o agente pode usar: cada skill, o perfil da empresa
 * e cada ferramenta do servidor MCP. A aprovação vale para UMA versão: se a skill
 * for refeita (v3), a aprovação da v2 continua valendo para o que está no ar,
 * mas a v3 precisa ser revisada.
 */
export const ApprovalSchema = z.object({
  decision: z.enum(["aprovado", "recusado"]),
  version: z.number(),
  at: z.string(),
});
export type Approval = z.infer<typeof ApprovalSchema>;

export const ApprovalsSchema = z.object({
  schemaVersion: z.literal(1),
  items: z.record(z.string(), ApprovalSchema),
});
export type Approvals = z.infer<typeof ApprovalsSchema>;

// ───────────────────────── Consultas aos sistemas ─────────────────────────

/**
 * Uma consulta NOMEADA e somente leitura que o agente pode executar.
 * O agente nunca escreve SQL: só escolhe uma consulta aprovada e passa os parâmetros.
 * No SQL, parâmetros aparecem como :nome e são enviados SEPARADOS do texto (nunca colados).
 */
export const QueryParamSchema = z.object({
  name: z.string().regex(/^[a-z_][a-z0-9_]*$/),
  type: z.enum(["texto", "numero", "data"]),
  description: z.string(),
  required: z.boolean(),
});
export type QueryParam = z.infer<typeof QueryParamSchema>;

export const QuerySchema = z.object({
  /** Vira o nome da ferramenta: consultar_<id>. */
  id: z.string().regex(/^[a-z0-9_]+$/),
  title: z.string(),
  /** Quando o agente deve usar (linguagem simples). */
  description: z.string(),
  /** Banco do inventário (Database.id). */
  databaseId: z.string(),
  sql: z.string(),
  params: z.array(QueryParamSchema),
  maxRows: z.number().int().min(1).max(200),
  /** Como foi criada: pelo assistente ou SQL escrito à mão. */
  origin: z.enum(["assistente", "manual"]),
  /** Aumenta a cada alteração: a aprovação vale para uma revisão. */
  revision: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Query = z.infer<typeof QuerySchema>;

export const QueriesFileSchema = z.object({ schemaVersion: z.literal(1), queries: z.array(QuerySchema) });
export type QueriesFile = z.infer<typeof QueriesFileSchema>;
