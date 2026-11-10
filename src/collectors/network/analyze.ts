/**
 * Interpretação da varredura de rede: mudanças desde a anterior e perguntas para pessoas.
 */
import type { Change, CompanyProfile, NetDevice, Question } from "../../core/schema.js";
import { diffFacts, networkFacts } from "../../core/facts.js";

type NewChange = Omit<Change, "id" | "at">;
type NewQuestion = Omit<Question, "id" | "status" | "createdAt">;

const label = (d: NetDevice) => (d.hostname ? `${d.hostname} (${d.ip})` : d.ip);
const SERVER = /servidor|controlador|banco|e-mail/;

/** Compara só os equipamentos dentro das faixas varridas agora. */
export function compareNetwork(prev: NetDevice[], next: NetDevice[], scope: Set<string>): { changes: NewChange[]; questions: NewQuestion[] } {
  const before = networkFacts(prev.filter((d) => scope.has(d.ip)));
  const after = networkFacts(next);
  const changes: NewChange[] = [];
  const questions: NewQuestion[] = [];
  const byIp = new Map([...prev, ...next].map((d) => [d.ip, d]));

  for (const d of diffFacts(before, after)) {
    const [, ip, area, ...rest] = d.key.split(":");
    const item = rest.join(":");
    const dev = byIp.get(ip)!;
    let summary: string;
    let importance: Change["importance"];
    if (area === "tipo") {
      importance = "media";
      summary =
        d.kind === "adicionado" ? `Novo equipamento na rede: ${ip}, ${d.after}` : d.kind === "removido" ? `Equipamento não respondeu mais: ${ip}, ${d.before}` : `Equipamento ${ip} mudou: ${d.before} → ${d.after}`;
    } else if (area === "sistema") {
      importance = "alta";
      summary = d.kind === "adicionado" ? `Sistema apareceu na rede em ${label(dev)}: ${d.after}` : `Sistema sumiu da rede em ${label(dev)}: ${d.before}`;
    } else {
      importance = "media";
      summary = d.kind === "adicionado" ? `Serviço novo em ${label(dev)}: ${item} (${d.after})` : d.kind === "removido" ? `Serviço deixou de responder em ${label(dev)}: ${item} (${d.before})` : `Serviço mudou em ${label(dev)}: ${item}`;
    }
    changes.push({ layer: "tecnico", subject: `rede:${ip}`, kind: d.kind, area: area === "tipo" ? "equipamento" : area, item: item || ip, before: d.before, after: d.after, importance, summary, factKeys: [d.key] });
    if (importance === "alta") {
      questions.push({
        layer: "tecnico",
        topic: `rede:${ip}`,
        text: d.kind === "removido" ? `${summary}. Foi desligado, mudou de endereço ou foi substituído?` : `${summary}. É algo novo em uso, um teste, ou substitui outro sistema?`,
        context: "Mudança detectada entre duas varreduras de rede.",
        source: "comparacao",
        askWho: "TI",
      });
    }
  }
  return { changes, questions };
}

/** Perguntas sobre o que a varredura encontrou e não consegue interpretar sozinha. */
export function analyzeNetwork(devices: NetDevice[], _company: CompanyProfile): NewQuestion[] {
  const out: NewQuestion[] = [];
  for (const d of devices) {
    const base = { layer: "tecnico" as const, topic: `rede:${d.ip}`, source: "coletor:rede", askWho: "TI" };
    const recognized = new Set(d.systems.flatMap((s) => s.evidence.map((e) => e.match(/porta (\d+)/)?.[1])).filter(Boolean).map(Number));

    // Bancos de dados: é por aqui que o coletor de bancos (próximo passo) vai começar.
    for (const s of d.services.filter((x) => x.category === "banco-de-dados")) {
      out.push({ ...base, text: `Há um banco de dados ${s.name} em ${label(d)}, porta ${s.port}. Qual sistema usa esse banco e quem é o responsável por ele?`, context: `Equipamento classificado como: ${d.kind}.` });
    }

    // Serviços web não reconhecidos em servidores, ou em portas alternativas (costumam ser sistemas internos).
    for (const s of d.services.filter((x) => x.category === "web" && !recognized.has(x.port))) {
      const alt = ![80, 443].includes(s.port);
      if (!alt && !SERVER.test(d.kind)) continue;
      const url = `${s.port === 443 || s.port === 8443 ? "https" : "http"}://${d.ip}${[80, 443].includes(s.port) ? "" : `:${s.port}`}`;
      out.push({ ...base, text: `O endereço ${url} (${d.hostname ?? "sem nome"}) é de qual sistema? Quem usa?`, context: s.banner ? `A página apresenta: ${s.banner}` : "Serviço web sem identificação." });
    }

    // Protocolos sem criptografia.
    for (const s of d.services.filter((x) => x.category === "inseguro")) {
      out.push({ ...base, text: `${label(d)} aceita ${s.name} (porta ${s.port}), um protocolo sem criptografia. Ele ainda é usado? Para quê?`, context: s.banner ? `O serviço apresenta: ${s.banner}` : `Equipamento: ${d.kind}.` });
    }
  }
  return out;
}
