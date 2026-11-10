import { createInterface, type Interface } from "node:readline";

/**
 * Leitor de linhas que funciona tanto no terminal interativo quanto com entrada
 * redirecionada (pipe/arquivo). Linhas que chegam antes da pergunta ficam em fila
 * em vez de se perderem, o que permite testar e automatizar a entrevista.
 *
 * Use sempre `Prompter.shared()`: um único leitor por execução, para que menu,
 * entrevista e pendências compartilhem a mesma entrada.
 */
export class Prompter {
  private static instance: Prompter | undefined;
  private rl: Interface;
  private buffer: string[] = [];
  private waiters: Array<(line: string | null) => void> = [];
  private closed = false;
  /** Quando true, o que é digitado não aparece na tela (senhas). */
  private muted = false;

  static shared(): Prompter {
    if (!Prompter.instance) Prompter.instance = new Prompter();
    return Prompter.instance;
  }

  static closeShared(): void {
    Prompter.instance?.rl.close();
    Prompter.instance = undefined;
  }

  private constructor() {
    this.rl = createInterface({ input: process.stdin, terminal: process.stdin.isTTY ?? false });
    // Esconde a digitação enquanto "muted": cada caractere vira *, e a quebra de linha passa.
    const rlAny = this.rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    const original = rlAny._writeToOutput?.bind(this.rl);
    rlAny._writeToOutput = (s: string) => {
      if (!this.muted) return original?.(s);
      if (/[\r\n]/.test(s)) process.stdout.write("\n");
      else if (s.length === 1) process.stdout.write("*");
    };
    this.rl.on("line", (line) => {
      const w = this.waiters.shift();
      if (w) w(line);
      else this.buffer.push(line);
    });
    this.rl.on("close", () => {
      this.closed = true;
      for (const w of this.waiters.splice(0)) w(null);
    });
  }

  /** Retorna a linha digitada, ou null se a entrada terminou. */
  async ask(question: string): Promise<string | null> {
    process.stdout.write(question);
    const echo = (line: string | null) => {
      // Sem terminal, a entrada não aparece na tela: ecoa para o registro ficar legível.
      if (line !== null && !process.stdin.isTTY) process.stdout.write(line + "\n");
      return line;
    };
    const next = this.buffer.shift();
    if (next !== undefined) return echo(next);
    if (this.closed) return null;
    return new Promise((resolve) => this.waiters.push((line) => resolve(echo(line))));
  }

  /** Pergunta sem mostrar o que é digitado. Sem terminal (testes, automação), lê normalmente sem ecoar. */
  async askSecret(question: string): Promise<string | null> {
    this.muted = true;
    try {
      process.stdout.write(question);
      const next = this.buffer.shift();
      if (next !== undefined) {
        process.stdout.write("\n");
        return next;
      }
      if (this.closed) return null;
      return await new Promise((resolve) => this.waiters.push(resolve));
    } finally {
      this.muted = false;
    }
  }

  /** Pergunta sim/não. Enter aceita o padrão. */
  async confirm(question: string, defaultYes = true): Promise<boolean> {
    const raw = await this.ask(`${question} ${defaultYes ? "[S/n]" : "[s/N]"} `);
    if (raw === null) return false;
    const t = raw.trim().toLowerCase();
    if (!t) return defaultYes;
    return t.startsWith("s") || t.startsWith("y");
  }
}
