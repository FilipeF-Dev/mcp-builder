/** Rótulos em linguagem simples para termos técnicos internos. */

const CATEGORY: Record<string, string> = {
  erp: "sistema de gestão (ERP)",
  pdv: "ponto de venda",
  negocio: "sistema de negócio",
  "banco-de-dados": "banco de dados",
  "servidor-web": "servidor web",
  diretorio: "diretório de usuários",
  "acesso-remoto": "acesso remoto",
  backup: "backup",
  seguranca: "segurança",
  integracao: "integração",
  email: "servidor de e-mail",
};

export function categoryLabel(c: string): string {
  return CATEGORY[c] ?? c;
}

export function topicLabel(topic: string): string {
  if (topic.startsWith("host:")) return `Computador ${topic.slice(5)}`;
  if (topic.startsWith("entrevista:")) return "Entrevista sobre o negócio";
  return topic;
}

const CONFIDENCE: Record<string, string> = { alta: "alta", media: "média", baixa: "baixa" };

export function confidenceLabel(c: string): string {
  return CONFIDENCE[c] ?? c;
}
