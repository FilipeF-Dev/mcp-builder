/**
 * Gera docs/03-a-entrevista.md a partir do roteiro real (src/company/levels.ts),
 * para que a documentação nunca fique diferente do que a ferramenta pergunta.
 *
 * Uso: npm run docs
 */
import { writeFileSync } from "node:fs";
import { LEVELS, MIN_LEVEL_FOR_TECH_SCAN } from "../src/company/levels.js";

const TYPE_LABEL = {
  text: "texto livre",
  number: "número",
  choice: "escolha uma opção",
  multi: "escolha uma ou mais",
  list: "lista (separe por ;)",
} as const;

const out: string[] = [
  "# A entrevista",
  "",
  "<!-- Arquivo gerado automaticamente por `npm run docs` a partir de src/company/levels.ts. Não edite à mão. -->",
  "",
  "A entrevista é a **etapa 1** e a base de todo o processo. Ela vai do básico ao complexo em 6 níveis.",
  `Os níveis 1 a ${MIN_LEVEL_FOR_TECH_SCAN} precisam estar concluídos antes da análise técnica (etapa 2).`,
  "",
  "## Quem chamar para responder",
  "",
  "| Níveis | Quem costuma saber |",
  "|---|---|",
  "| 1 e 2 | Dono, diretoria ou gerente geral |",
  "| 3 e 4 | Gestores das áreas, RH e TI |",
  "| 5 | TI e usuários-chave dos sistemas |",
  "| 6 | Diretoria junto com o TI |",
  "",
  "Não precisa ser tudo de uma vez nem com a mesma pessoa. Quando não souber, digite `?`: a pergunta vira uma pendência com a sugestão de quem procurar.",
  "",
  "## Comandos durante a entrevista",
  "",
  "| Digite | Para |",
  "|---|---|",
  "| o número da opção | escolher (várias: `1,3,4`) |",
  "| `?` | \"não sei\": vira pendência para outra pessoa |",
  "| Enter (vazio) | pular uma pergunta opcional |",
  "| `!sair` | salvar e voltar ao menu |",
  "",
  "Para corrigir respostas já dadas: no menu, opção **6. Corrigir respostas da entrevista**.",
  "",
];

for (const level of LEVELS) {
  out.push(`## Nível ${level.level}: ${level.title}`, "");
  out.push(`**Por que este nível:** ${level.why}`, "");
  out.push(`**O que ele embasa:** ${level.informs.join("; ")}.`, "");
  out.push("| Pergunta | Tipo | Obrigatória |", "|---|---|---|");
  for (const q of level.questions) {
    let prompt = q.prompt;
    if (q.options) prompt += `<br><sub>Opções: ${q.options.join(" · ")}</sub>`;
    if (q.help) prompt += `<br><sub>${q.help}</sub>`;
    if (q.showIf) prompt += "<br><sub>(aparece só quando faz sentido, conforme respostas anteriores)</sub>";
    out.push(`| ${prompt.replace(/\|/g, "\\|")} | ${TYPE_LABEL[q.type]} | ${q.required ? "sim" : "não"} |`);
  }
  out.push("");
}

out.push("## Importar respostas de um formulário", "");
out.push("Se preferir coletar as respostas por outro meio (formulário, e-mail), monte um arquivo JSON com o identificador de cada pergunta e importe com:");
out.push("", "```bash", "mcp-builder entrevista --importar respostas.json", "```", "");
out.push("Identificadores disponíveis:", "");
for (const level of LEVELS) out.push(`- **Nível ${level.level}:** ${level.questions.map((q) => `\`${q.id}\``).join(", ")}`);
out.push("", "Exemplo:", "", "```json", JSON.stringify({ ramo: "Alimentação / food service", colaboradores: 3, areas: ["Operações", "Compras", "RH"], unidades_qtd: "?" }, null, 2), "```", "");
out.push("O valor `\"?\"` registra a pergunta como pendência.", "");

writeFileSync(new URL("../docs/03-a-entrevista.md", import.meta.url), out.join("\n"), "utf8");
console.log("docs/03-a-entrevista.md atualizado.");
