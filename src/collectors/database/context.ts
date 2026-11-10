import type { Workspace } from "../../core/workspace.js";
import { categoryLabel } from "../../core/labels.js";

/** Gera context/12-bancos.md: o que cada banco guarda, em linguagem de negócio. Para o TI. */
export function writeDatabasesContext(ws: Workspace): string {
  const dbs = ws.loadInventory().databases;
  const out: string[] = ["# Bancos de dados", "", "> Gerado pelo MCP-Builder a partir da ESTRUTURA dos bancos (tabelas e colunas). Nenhum dado foi lido.", ""];
  if (!dbs.length) out.push("_Nenhum banco lido ainda._");
  for (const d of dbs) {
    out.push(`## ${d.database} (${d.host}:${d.port})`, "");
    out.push(`- **Motor:** ${d.serverVersion ?? d.engine}`);
    out.push(`- **Tamanho:** ${d.tables} tabelas, ${d.views} views, ${d.routines} procedures/funções`);
    if (d.systems.length) out.push(`- **Sistema provável:** ${d.systems.map((s) => `${s.systemName} (${categoryLabel(s.category)}, certeza ${s.confidence})`).join("; ")}`);
    if (d.areas.length) out.push(`- **Áreas de negócio sugeridas pelas tabelas:** ${d.areas.join(", ")}`);
    out.push(`- **Lido em:** ${new Date(d.collectedAt).toLocaleString("pt-BR")} por ${d.by} (usuário de banco: ${d.dbUser})`);
    if (d.largestTables.length) {
      out.push("", "**Maiores tabelas** (estimativa do próprio banco):", "");
      for (const t of d.largestTables) out.push(`- ${t.name}: ~${t.approxRows.toLocaleString("pt-BR")} linhas`);
    }
    if (d.sensitive.length) {
      out.push("", "**Colunas com dados pessoais ou sensíveis** (o agente nunca pode expor):", "");
      const byKind = new Map<string, string[]>();
      for (const s of d.sensitive) byKind.set(s.kind, [...(byKind.get(s.kind) ?? []), s.column]);
      for (const [k, cols] of byKind) out.push(`- **${k}:** ${cols.slice(0, 15).join(", ")}${cols.length > 15 ? ` e mais ${cols.length - 15}` : ""}`);
    }
    out.push("");
  }
  return ws.writeContext("12-bancos.md", out.join("\n"));
}
