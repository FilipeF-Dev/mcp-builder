/**
 * Catálogo de portas TCP verificadas na varredura de rede.
 * Só portas de serviços conhecidos: o objetivo é inventariar, não procurar brechas.
 *
 * probe:
 *   "banner" → lê a primeira linha que o serviço envia (SSH, FTP, SMTP...)
 *   "http"   → faz um GET / e lê o cabeçalho Server e o <title>
 *   "https"  → idem, por TLS, e lê o nome do certificado
 */
export type Probe = "banner" | "http" | "https" | "none";

export interface PortInfo {
  port: number;
  name: string;
  category: "banco-de-dados" | "web" | "email" | "arquivos" | "acesso-remoto" | "diretorio" | "impressao" | "infraestrutura" | "inseguro";
  probe: Probe;
}

export const PORTS: PortInfo[] = [
  { port: 21, name: "FTP", category: "inseguro", probe: "banner" },
  { port: 22, name: "SSH", category: "acesso-remoto", probe: "banner" },
  { port: 23, name: "Telnet", category: "inseguro", probe: "none" },
  { port: 25, name: "SMTP (e-mail)", category: "email", probe: "banner" },
  { port: 53, name: "DNS", category: "infraestrutura", probe: "none" },
  { port: 80, name: "HTTP", category: "web", probe: "http" },
  { port: 88, name: "Kerberos", category: "diretorio", probe: "none" },
  { port: 110, name: "POP3 (e-mail)", category: "email", probe: "banner" },
  { port: 135, name: "RPC do Windows", category: "infraestrutura", probe: "none" },
  { port: 139, name: "NetBIOS", category: "arquivos", probe: "none" },
  { port: 143, name: "IMAP (e-mail)", category: "email", probe: "banner" },
  { port: 389, name: "LDAP", category: "diretorio", probe: "none" },
  { port: 443, name: "HTTPS", category: "web", probe: "https" },
  { port: 445, name: "Compartilhamento de arquivos (SMB)", category: "arquivos", probe: "none" },
  { port: 465, name: "SMTPS (e-mail)", category: "email", probe: "none" },
  { port: 515, name: "Impressão (LPD)", category: "impressao", probe: "none" },
  { port: 587, name: "SMTP envio (e-mail)", category: "email", probe: "banner" },
  { port: 631, name: "Impressão (IPP)", category: "impressao", probe: "none" },
  { port: 636, name: "LDAPS", category: "diretorio", probe: "none" },
  { port: 993, name: "IMAPS (e-mail)", category: "email", probe: "none" },
  { port: 995, name: "POP3S (e-mail)", category: "email", probe: "none" },
  { port: 1433, name: "SQL Server", category: "banco-de-dados", probe: "none" },
  { port: 1521, name: "Oracle", category: "banco-de-dados", probe: "none" },
  { port: 2049, name: "NFS", category: "arquivos", probe: "none" },
  { port: 3050, name: "Firebird", category: "banco-de-dados", probe: "none" },
  { port: 3306, name: "MySQL / MariaDB", category: "banco-de-dados", probe: "banner" },
  { port: 3389, name: "Área de trabalho remota (RDP)", category: "acesso-remoto", probe: "none" },
  { port: 5432, name: "PostgreSQL", category: "banco-de-dados", probe: "none" },
  { port: 5900, name: "VNC", category: "acesso-remoto", probe: "banner" },
  { port: 5985, name: "WinRM", category: "acesso-remoto", probe: "none" },
  { port: 6379, name: "Redis", category: "banco-de-dados", probe: "none" },
  { port: 8000, name: "HTTP alternativo", category: "web", probe: "http" },
  { port: 8080, name: "HTTP alternativo", category: "web", probe: "http" },
  { port: 8081, name: "HTTP alternativo", category: "web", probe: "http" },
  { port: 8443, name: "HTTPS alternativo", category: "web", probe: "https" },
  { port: 9100, name: "Impressora (RAW)", category: "impressao", probe: "none" },
  { port: 10050, name: "Agente Zabbix", category: "infraestrutura", probe: "none" },
  { port: 27017, name: "MongoDB", category: "banco-de-dados", probe: "none" },
];

/** Portas usadas para descobrir se um endereço está ativo (as mais comuns em qualquer rede). */
export const DISCOVERY_PORTS = [445, 135, 139, 22, 80, 443, 3389, 9100];

export function portInfo(port: number): PortInfo {
  return PORTS.find((p) => p.port === port) ?? { port, name: `Porta ${port}`, category: "infraestrutura", probe: "http" };
}
