/**
 * Catálogo de ASSINATURAS: padrões que identificam sistemas conhecidos.
 *
 * Para adicionar um sistema novo (ex.: o ERP de outro cliente), basta incluir
 * uma entrada aqui. O núcleo da ferramenta não muda.
 *
 * Princípio: uma assinatura gera uma HIPÓTESE com nível de confiança. Hipóteses
 * de sistemas de negócio sempre viram pergunta de confirmação para uma pessoa.
 */

export type SystemCategory =
  | "erp"
  | "pdv"
  | "negocio"
  | "banco-de-dados"
  | "servidor-web"
  | "diretorio"
  | "acesso-remoto"
  | "backup"
  | "seguranca"
  | "integracao"
  | "email";

export interface Signature {
  id: string;
  name: string;
  category: SystemCategory;
  /** Sistemas de negócio são confirmados com pessoas; infraestrutura comum não. */
  business: boolean;
  /** Regex testada contra nome/fabricante/caminho de programas instalados. */
  software?: RegExp;
  /** Regex testada contra nome, nome de exibição e comando de serviços. */
  service?: RegExp;
  /** Regex testada contra nome de processo que escuta em porta. */
  process?: RegExp;
  /** Portas típicas (só contam como evidência fraca, sozinhas não identificam). */
  ports?: number[];
  /** Regex contra DSNs ODBC e tarefas agendadas. */
  config?: RegExp;
  /** Nome genérico que gera falso positivo com facilidade: reduz a confiança. */
  ambiguous?: boolean;
  notes?: string;
}

export const SIGNATURES: Signature[] = [
  // ── Sistemas de negócio (Brasil) ──
  {
    id: "teknisa",
    name: "Teknisa",
    category: "erp",
    business: true,
    software: /teknisa/i,
    service: /teknisa/i,
    process: /teknisa/i,
    config: /teknisa/i,
    notes: "ERP/gestão para food service e varejo.",
  },
  {
    id: "touch",
    name: "Touch",
    category: "erp",
    business: true,
    ambiguous: true,
    // "touch" é palavra comum (touchpad, touchscreen): exige o termo isolado e exclui falsos positivos óbvios.
    software: /(^|[^a-z])touch(?!\s*(pad|screen|id|keyboard|panel))([^a-z]|$)/i,
    service: /(^|[^a-z])touch(?!\s*(pad|screen|id|keyboard|panel))([^a-z]|$)/i,
    config: /(^|[^a-z])touch([^a-z]|$)/i,
    notes: "Sistema de gestão. Padrão genérico: precisa de confirmação.",
  },
  {
    id: "totvs-protheus",
    name: "TOTVS Protheus",
    category: "erp",
    business: true,
    software: /totvs|protheus|smartclient/i,
    service: /totvs|protheus|appserver|dbaccess/i,
    process: /appserver|dbaccess|smartclient/i,
    ports: [1234, 7890, 7891],
  },
  { id: "totvs-rm", name: "TOTVS RM", category: "erp", business: true, software: /totvs\s*rm|corpore/i, service: /rm\.host|totvs.*rm/i },
  { id: "sap-b1", name: "SAP Business One", category: "erp", business: true, software: /sap business one/i, service: /sap business one|b1/i, ports: [30015, 40000] },
  { id: "senior", name: "Senior Sistemas", category: "erp", business: true, software: /senior sistemas|\bsapiens\b|vetorh/i, service: /senior/i },
  { id: "linx", name: "Linx", category: "pdv", business: true, software: /\blinx\b/i, service: /\blinx\b/i },
  { id: "sankhya", name: "Sankhya", category: "erp", business: true, software: /sankhya/i, service: /sankhya/i },
  { id: "dominio", name: "Domínio Sistemas (Thomson Reuters)", category: "negocio", business: true, software: /dom[ií]nio sistemas|contabil.*dom[ií]nio/i },
  { id: "glpi", name: "GLPI (chamados)", category: "negocio", business: true, software: /glpi/i, service: /glpi/i },

  // ── Bancos de dados ──
  {
    id: "sqlserver",
    name: "Microsoft SQL Server",
    category: "banco-de-dados",
    business: false,
    software: /^microsoft sql server \d{4}(?! .*(setup|compact|lang|management|odbc|native client|t-sql|express localdb))/i,
    service: /^MSSQL(\$|SERVER)/i,
    process: /^sqlservr$/i,
    ports: [1433, 1434],
  },
  { id: "postgres", name: "PostgreSQL", category: "banco-de-dados", business: false, software: /postgresql/i, service: /postgres/i, process: /^postgres/i, ports: [5432] },
  { id: "mysql", name: "MySQL / MariaDB", category: "banco-de-dados", business: false, software: /mysql server|mariadb/i, service: /^mysql|mariadb/i, process: /^mysqld|^mariadbd/i, ports: [3306] },
  { id: "oracle", name: "Oracle Database", category: "banco-de-dados", business: false, service: /^OracleService|oracle.*tnslistener/i, process: /^oracle$|^tnslsnr$/i, ports: [1521] },
  {
    id: "firebird",
    name: "Firebird",
    category: "banco-de-dados",
    business: false,
    software: /firebird|interbase/i,
    service: /firebird|interbase/i,
    process: /^fbserver|^fb_inet_server|^firebird|^ibserver/i,
    ports: [3050],
    notes: "Muito usado por ERPs e PDVs nacionais.",
  },
  { id: "mongodb", name: "MongoDB", category: "banco-de-dados", business: false, service: /mongodb/i, process: /^mongod$/i, ports: [27017] },
  { id: "redis", name: "Redis", category: "banco-de-dados", business: false, service: /redis/i, process: /^redis-server/i, ports: [6379] },

  // ── Servidores web / integração ──
  { id: "iis", name: "IIS", category: "servidor-web", business: false, service: /^W3SVC$/i },
  { id: "apache", name: "Apache HTTP", category: "servidor-web", business: false, service: /^apache2?$|^httpd$/i, process: /^httpd$|^apache2$/i },
  { id: "nginx", name: "nginx", category: "servidor-web", business: false, service: /nginx/i, process: /^nginx$/i },
  { id: "tomcat", name: "Apache Tomcat", category: "servidor-web", business: false, software: /tomcat/i, service: /tomcat/i },
  { id: "rabbitmq", name: "RabbitMQ", category: "integracao", business: false, service: /rabbitmq/i, ports: [5672, 15672] },

  // ── E-mail ──
  { id: "exchange", name: "Microsoft Exchange Server", category: "email", business: false, software: /microsoft exchange server/i, service: /^MSExchange(IS|Transport|FrontEndTransport)$/i, ports: [25, 587, 993] },
  { id: "hmailserver", name: "hMailServer", category: "email", business: false, software: /hmailserver/i, service: /hmailserver/i, process: /^hmailserver$/i, ports: [25, 110, 143] },
  { id: "mdaemon", name: "MDaemon", category: "email", business: false, software: /mdaemon/i, service: /mdaemon/i, ports: [25, 110, 143] },
  { id: "zimbra", name: "Zimbra", category: "email", business: false, service: /zimbra/i, software: /^zimbra/i, ports: [25, 7071] },
  { id: "postfix", name: "Postfix", category: "email", business: false, software: /^postfix$/i, service: /^postfix/i, ports: [25, 587] },
  { id: "dovecot", name: "Dovecot", category: "email", business: false, software: /^dovecot/i, service: /^dovecot/i, process: /^dovecot$/i, ports: [110, 143, 993] },

  // ── Diretório ──
  { id: "ad-ds", name: "Active Directory (controlador de domínio)", category: "diretorio", business: false, service: /^NTDS$/i, ports: [389, 636, 88] },
  { id: "openldap", name: "OpenLDAP", category: "diretorio", business: false, service: /slapd/i, process: /^slapd$/i },

  // ── Acesso remoto (relevante para segurança) ──
  { id: "anydesk", name: "AnyDesk", category: "acesso-remoto", business: false, software: /anydesk/i, service: /anydesk/i },
  { id: "teamviewer", name: "TeamViewer", category: "acesso-remoto", business: false, software: /teamviewer/i, service: /teamviewer/i },
  { id: "vnc", name: "VNC", category: "acesso-remoto", business: false, software: /vnc/i, service: /vnc/i, ports: [5900] },

  // ── Backup ──
  { id: "veeam", name: "Veeam Backup", category: "backup", business: false, software: /veeam/i, service: /veeam/i },
  { id: "cobian", name: "Cobian Backup", category: "backup", business: false, software: /cobian/i, service: /cobian/i },
];
