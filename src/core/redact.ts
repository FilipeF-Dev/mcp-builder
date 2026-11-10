/**
 * Mascaramento de segredos. Aplicado NA COLETA, antes de qualquer dado ser gravado
 * em disco ou enviado a um LLM. Na dúvida, mascara.
 */

export const MASK = "«oculto»";

const KEY_WORDS =
  "password|passwd|pwd|pass|senha|secret|segredo|token|api[_-]?key|apikey|access[_-]?key|client[_-]?secret|auth|credential|private[_-]?key";

const RULES: Array<[RegExp, string | ((...m: string[]) => string)]> = [
  // Connection strings: Password=xxx; Pwd=xxx; senha=xxx (até ; ou aspas ou espaço)
  [new RegExp(`\\b(${KEY_WORDS})(\\s*[=:]\\s*)("[^"]*"|'[^']*'|[^;\\s"'&]+)`, "gi"), (_m, k, sep) => `${k}${sep}${MASK}`],
  // Argumentos de linha de comando: --password xxx, -p:xxx, /p:xxx, -pwd xxx
  [new RegExp(`(--?(?:${KEY_WORDS})[\\s:=]+)("[^"]*"|\\S+)`, "gi"), (_m, k) => `${k}${MASK}`],
  [/(\s\/p(?:assword)?:)(\S+)/gi, (_m, k) => `${k}${MASK}`],
  // sqlcmd/bcp/osql: -P senha (P maiúsculo)
  [/(\s-P\s+)("[^"]*"|\S+)/g, (_m, k) => `${k}${MASK}`],
  // mysql/mysqldump: -psenha (colado)
  [/(\bmysql(?:dump|admin)?(?:\.exe)?\b[^\n]*?\s-p)([^\s-]\S*)/gi, (_m, k) => `${k}${MASK}`],
  // Credenciais em URL: scheme://user:pass@host
  [/([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)([^\s@/]+)(@)/gi, (_m, a, _p, c) => `${a}${MASK}${c}`],
  // Cabeçalhos Bearer/Basic
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, (_m, k) => `${k} ${MASK}`],
  // Chaves conhecidas
  [/\bsk-[A-Za-z0-9_-]{16,}/g, MASK], // OpenAI/Anthropic-like
  [/\bAKIA[0-9A-Z]{16}\b/g, MASK], // AWS access key
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, MASK], // GitHub
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, MASK], // JWT
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, MASK],
];

export function redact(text: string): string;
export function redact(text: string | undefined): string | undefined;
export function redact(text: string | undefined): string | undefined {
  if (!text) return text;
  let out = text;
  for (const [re, rep] of RULES) out = out.replace(re, rep as never);
  return out;
}

/** Aplica redact em todas as strings de um objeto (profundo). */
export function redactDeep<T>(value: T): T {
  if (typeof value === "string") return redact(value) as T;
  if (Array.isArray(value)) return value.map(redactDeep) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep(v)])) as T;
  }
  return value;
}
