import type { CompanyProfile, Host, Question } from "../../core/schema.js";
import { SIGNATURES } from "../../signatures/catalog.js";
import { DISCOVERY_PORTS, isLoopback } from "../../core/facts.js";

type NewQuestion = Omit<Question, "id" | "status" | "createdAt">;

/** Processos de sistema operacional que escutam em portas por padrão: não geram pergunta. */
const OS_PROCESSES = new Set(
  ["system", "idle", "svchost", "dashost", "lsass", "wininit", "services", "spoolsv", "smss", "csrss", "systemd", "systemd-resolve", "sshd", "chronyd", "rpcbind", "avahi-daemon", "cupsd", "dhclient", "systemd-network", "systemd-timesyn"].map((p) => p.toLowerCase()),
);

const DEFAULT_ODBC = new Set(["MS Access Database", "Excel Files", "dBASE Files", "Visio Database Samples"]);

/** Tarefas que rodam scripts ou ferramentas de dados costumam ser integrações e rotinas caseiras. */
const CUSTOM_TASK = /\.(bat|cmd|ps1|vbs|py|sh|js|jar)\b|powershell|wscript|cscript|python|java\b|curl|wget|rsync|robocopy|sqlcmd|bcp\b|mysqldump|pg_dump|ftp/i;


/**
 * Cruza o que foi coletado no host com o que a empresa disse na entrevista
 * e gera perguntas para tudo que a ferramenta não consegue interpretar sozinha.
 */
export function analyzeHost(host: Host, company: CompanyProfile): NewQuestion[] {
  const out: NewQuestion[] = [];
  const topic = `host:${host.hostname}`;
  const base = { layer: "tecnico" as const, topic, source: "coletor:host" };
  const isServer = host.role !== "estação de trabalho";

  // O que a entrevista disse sobre sistemas (texto livre, normalizado).
  const said = (ids: string[]) =>
    ids
      .map((id) => company.answers[id]?.value)
      .flat()
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  const systemsSaid = said(["erp", "outros_sistemas", "integracoes", "fontes_verdade"]);
  const migrationSaid = said(["migracoes"]);

  // 1. Sistemas de negócio detectados × entrevista
  for (const m of host.systems) {
    const sig = SIGNATURES.find((x) => x.id === m.signatureId);
    if (!sig?.business) continue;
    const name = m.systemName.toLowerCase();
    const ev = m.evidence.join("; ");
    // A entrevista corrobora o scan: um indício fraco citado pelas pessoas deixa de ser fraco.
    const mentioned = systemsSaid.includes(name) || migrationSaid.includes(name);

    if (m.confidence === "baixa" && !mentioned) {
      out.push({ ...base, text: `Encontrei indícios fracos de "${m.systemName}" em ${host.hostname}. Isso é mesmo o ${m.systemName}?`, context: ev, askWho: "TI" });
    } else if (migrationSaid.includes(name)) {
      out.push({
        ...base,
        text: `${m.systemName} faz parte da migração citada na entrevista. Em ${host.hostname} (${host.role ?? "?"}), qual o papel dele hoje: sistema em uso, novo em implantação/teste, ou já desativado?`,
        context: ev,
        askWho: "TI",
      });
    } else if (!systemsSaid.includes(name)) {
      out.push({
        ...base,
        text: `Detectei ${m.systemName} em ${host.hostname}, mas ele não foi citado na entrevista. Ele ainda é usado? Para quê, e por qual área?`,
        context: ev,
        askWho: "TI",
      });
    } else if (isServer) {
      out.push({ ...base, text: `${host.hostname} parece hospedar o ${m.systemName}. É o ambiente de produção, de homologação ou outro?`, context: ev, askWho: "TI" });
    }
  }

  // 2. Portas abertas para a rede por processos não identificados
  const explained = new Set(
    host.systems.flatMap((m) => m.evidence).join(" ").toLowerCase().match(/processo (\S+)/g)?.map((x) => x.replace("processo ", "")) ?? [],
  );
  const byProcess = new Map<string, number[]>();
  for (const p of host.listeningPorts) {
    if (isLoopback(p.address) || p.port >= 49152 || DISCOVERY_PORTS.has(p.port)) continue;
    const proc = (p.process ?? "desconhecido").toLowerCase();
    if (OS_PROCESSES.has(proc) || explained.has(proc)) continue;
    byProcess.set(proc, [...new Set([...(byProcess.get(proc) ?? []), p.port])]);
  }
  for (const [proc, ports] of byProcess) {
    out.push({
      ...base,
      text: `O processo "${proc}" em ${host.hostname} aceita conexões de rede na(s) porta(s) ${ports.sort((a, b) => a - b).join(", ")}. Que sistema é esse e quem o usa?`,
      context: "Porta aberta para a rede sem assinatura conhecida.",
      askWho: "TI",
    });
  }

  // 3. Tarefas agendadas que executam scripts (possíveis integrações/rotinas)
  for (const t of host.scheduledTasks) {
    if (!t.action || !CUSTOM_TASK.test(t.action) || /run-parts|e2scrub|logrotate|apt|dnf|yum/i.test(t.action)) continue;
    out.push({
      ...base,
      text: `A tarefa agendada "${t.name}" em ${host.hostname} executa: ${t.action}. O que ela faz? Integra algum sistema, gera relatório ou faz backup?`,
      context: `Executa como ${t.runAs ?? "?"}; estado ${t.state ?? "?"}.`,
      askWho: "TI",
    });
  }

  // 4. Fontes ODBC configuradas (apontam para bancos usados por algum sistema)
  for (const d of host.dataSources) {
    if (DEFAULT_ODBC.has(d.name)) continue;
    out.push({
      ...base,
      text: `A fonte de dados ODBC "${d.name}" (${d.driver ?? "driver ?"}) em ${host.hostname} aponta para qual banco, e qual sistema ou planilha a usa?`,
      context: d.details,
      askWho: "TI",
    });
  }

  return out;
}
