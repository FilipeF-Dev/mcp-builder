/**
 * Interpretação da ESTRUTURA de um banco (sem olhar os dados):
 *   - áreas de negócio que as tabelas sugerem (clientes, estoque, fiscal, RH...);
 *   - colunas com dados pessoais ou sensíveis, que viram regras de segurança (LGPD);
 *   - sistema provável, pelo nome do banco e dos esquemas.
 */
import type { DbStructure, SensitiveColumn, SystemMatch } from "../../core/schema.js";
import { SIGNATURES } from "../../signatures/catalog.js";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Áreas de negócio por palavras comuns em nomes de tabela (português e inglês). */
const AREAS: Array<[string, RegExp]> = [
  ["clientes", /client|customer|consumidor/],
  ["fornecedores", /fornec|supplier|vendor/],
  ["produtos", /produt|product|mercador|material|insumo/],
  ["estoque", /estoq|stock|invent|armazem|deposit|almox/],
  ["vendas e pedidos", /pedid|venda|order|sale|cupom/],
  ["compras", /compra|purchas|requisi|cotac/],
  ["financeiro", /financ|pagar|receber|titulo|boleto|caixa|payment|invoice|fatur|contabil|lancament/],
  ["fiscal", /fiscal|nfe|nfce|notafis|nota_?fiscal|sped|icms|tribut|cfop|ncm/],
  ["RH e folha", /funcion|colaborad|employee|folha|salari|ponto|holerit|payroll|admiss/],
  ["cardápio e produção", /cardap|receita|ficha_?tec|producao|recipe|menu/],
  ["usuários e acessos", /usuario|^users?$|_users?$|login|perfil|permiss|acesso/],
];

/** Colunas sensíveis (LGPD), por nome. Na dúvida, marca: é melhor uma regra a mais do que um vazamento. */
const SENSITIVE: Array<[string, RegExp]> = [
  ["CPF", /(^|_)(nr_?|num_?)?cpf($|_)/],
  ["CNPJ", /(^|_)(nr_?|num_?)?cnpj($|_)/],
  ["RG", /(^|_)rg($|_)|identidade/],
  ["PIS/NIS", /(^|_)(pis|pasep|nis)($|_)/],
  ["data de nascimento", /nasc|birth|dt_?nasc/],
  ["salário e remuneração", /salari|salary|remunera|vencimento_?base|proventos?/],
  ["senha", /senha|password|passwd|(^|_)pwd($|_)|hash_?senha/],
  ["cartão de pagamento", /cartao|card_?num|cc_?num|(^|_)cvv($|_)/],
  ["dados bancários", /agencia|conta_?corrente|(^|_)iban($|_)|chave_?pix|(^|_)pix($|_)/],
  ["e-mail", /(^|_)e_?mail($|_)/],
  ["telefone", /telefone|(^|_)fone|celular|phone|whats/],
  ["endereço", /endereco|logradouro|address|(^|_)cep($|_)/],
  ["saúde", /saude|(^|_)cid($|_)|doenca|atestado|alergi|health/],
];

export function businessAreas(s: Pick<DbStructure, "tables">): string[] {
  const names = s.tables.map((t) => norm(t.name));
  return AREAS.filter(([, re]) => names.some((n) => re.test(n))).map(([area]) => area);
}

export function sensitiveColumns(s: Pick<DbStructure, "tables">): SensitiveColumn[] {
  const out: SensitiveColumn[] = [];
  for (const t of s.tables) {
    for (const c of t.columns) {
      const n = norm(c.name);
      const hit = SENSITIVE.find(([, re]) => re.test(n));
      if (hit) out.push({ column: `${t.schema}.${t.name}.${c.name}`, kind: hit[0] });
    }
  }
  return out;
}

/** Sistema provável pelo nome do banco e dos esquemas (ex.: um banco chamado "teknisa_prod"). */
export function matchDatabase(database: string, s: Pick<DbStructure, "tables">): SystemMatch[] {
  const schemas = [...new Set(s.tables.map((t) => t.schema))];
  const out: SystemMatch[] = [];
  for (const sig of SIGNATURES) {
    if (!sig.business) continue;
    const re = sig.banner ?? sig.software;
    if (!re) continue;
    const evidence: string[] = [];
    if (re.test(database)) evidence.push(`nome do banco: ${database}`);
    const sch = schemas.filter((x) => re.test(x));
    if (sch.length) evidence.push(`esquema(s): ${sch.slice(0, 3).join(", ")}`);
    if (!evidence.length) continue;
    const score = evidence.length * 2 - (sig.ambiguous ? 1 : 0);
    if (score <= 0) continue;
    out.push({ signatureId: sig.id, systemName: sig.name, category: sig.category, confidence: score >= 4 ? "alta" : score >= 2 ? "media" : "baixa", evidence });
  }
  return out;
}

export function largestTables(s: Pick<DbStructure, "tables">, n = 10): Array<{ name: string; approxRows: number }> {
  return s.tables
    .filter((t) => t.kind === "tabela" && (t.approxRows ?? 0) > 0)
    .sort((a, b) => (b.approxRows ?? 0) - (a.approxRows ?? 0))
    .slice(0, n)
    .map((t) => ({ name: `${t.schema}.${t.name}`, approxRows: t.approxRows! }));
}
