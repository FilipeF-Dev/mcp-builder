import type { Workspace } from "../../core/workspace.js";
import { categoryLabel } from "../../core/labels.js";

/** Gera context/11-rede.md: equipamentos e serviços encontrados. É para o TI, não vai para o agente. */
export function writeNetworkContext(ws: Workspace): string {
  const net = ws.loadInventory().network;
  const out: string[] = ["# Rede", "", "> Gerado pelo MCP-Builder a partir das varreduras de rede autorizadas. O tipo de cada equipamento é uma hipótese baseada nas portas abertas.", ""];

  if (net.scans.length) {
    out.push("## Varreduras", "", "| Quando | Faixas | Endereços | Encontrados | Por |", "|---|---|---|---|---|");
    for (const s of net.scans.slice(-10).reverse()) out.push(`| ${new Date(s.at).toLocaleString("pt-BR")} | ${s.ranges.join(", ")} | ${s.addresses} | ${s.devicesFound} | ${s.by} |`);
    out.push("");
  }

  const groups = new Map<string, typeof net.devices>();
  for (const d of net.devices) groups.set(d.kind, [...(groups.get(d.kind) ?? []), d]);
  for (const [kind, devices] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
    out.push(`## ${kind[0].toUpperCase() + kind.slice(1)} (${devices.length})`, "");
    for (const d of devices) {
      out.push(`- **${d.ip}**${d.hostname ? ` (${d.hostname})` : ""}${d.mac ? `, MAC ${d.mac}` : ""}`);
      for (const s of d.services) out.push(`  - ${s.port} ${s.name}${s.banner ? `: _${s.banner}_` : ""}`);
      for (const s of d.systems) out.push(`  - Sistema reconhecido: **${s.systemName}** (${categoryLabel(s.category)}, certeza ${s.confidence})`);
    }
    out.push("");
  }
  if (!net.devices.length) out.push("_Nenhuma varredura de rede feita ainda._");
  return ws.writeContext("11-rede.md", out.join("\n"));
}
