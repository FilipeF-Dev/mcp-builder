/** Utilitários de redação usados pelos modelos de skill. */

/** Marca de informação faltando: aparece na skill até alguém responder a pendência. */
export function todo(question: string): string {
  return `⚠ **A definir:** ${question}`;
}

/** Usa o valor se existir; senão, a marca de "a definir". */
export function or(value: string | undefined, question: string): string {
  return value?.trim() ? value.trim() : todo(question);
}

export function bullets(items: string[], empty = "_(nenhum informado)_"): string[] {
  return items.length ? items.map((i) => `- ${i}`) : [empty];
}

/** Nome válido de skill: minúsculas, números e hífens, até 64 caracteres. */
export function skillName(...parts: string[]): string {
  return parts
    .join("-")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64)
    .replace(/-$/, "");
}

/** Instrução de tom de voz a partir da resposta do nível 6. */
export function toneLine(tom: string | undefined, familiaridade: string | undefined): string {
  const t = tom ?? "Cordial e direto";
  const simple = familiaridade?.startsWith("Baixa")
    ? " Os usuários têm pouca familiaridade com tecnologia: explique passo a passo, sem termos técnicos."
    : "";
  return `Tom de voz: **${t}**.${simple}`;
}

/** Primeira letra minúscula (para encaixar respostas no meio de uma frase). */
export function lc(text: string): string {
  // Só a primeira letra, e só se a segunda não for maiúscula (preserva siglas como "ERP").
  return text.replace(/^\p{Lu}(?!\p{Lu})/u, (c) => c.toLowerCase());
}
