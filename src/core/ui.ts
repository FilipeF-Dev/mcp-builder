/** Cores do terminal. Desligadas com NO_COLOR ou quando a saída não é um terminal. */
const enabled = !process.env.NO_COLOR && process.stdout.isTTY;
const wrap = (code: string) => (s: string) => (enabled ? `\x1b[${code}m${s}\x1b[0m` : s);

export const ui = {
  bold: wrap("1"),
  dim: wrap("2"),
  red: wrap("31"),
  green: wrap("32"),
  yellow: wrap("33"),
  cyan: wrap("36"),
};
