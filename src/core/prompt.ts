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

  /** Pergunta sim/não. Enter aceita o padrão. */
  async confirm(question: string, defaultYes = true): Promise<boolean> {
    const raw = await this.ask(`${question} ${defaultYes ? "[S/n]" : "[s/N]"} `);
    if (raw === null) return false;
    const t = raw.trim().toLowerCase();
    if (!t) return defaultYes;
    return t.startsWith("s") || t.startsWith("y");
  }
}
