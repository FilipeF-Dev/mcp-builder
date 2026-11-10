import type { Workspace } from "../../core/workspace.js";

/** Gera context/10-hosts.md: o que existe em cada máquina inventariada. */
export function writeHostsContext(ws: Workspace): string {
  const inv = ws.loadInventory();
  const out: string[] = ["# Máquinas inventariadas", "", "> Gerado pelo MCP-Builder a partir dos coletores de host. Segredos já mascarados.", ""];

  for (const h of inv.hosts) {
    out.push(`## ${h.hostname}`);
    out.push("");
    out.push(`- **Papel:** ${h.role ?? "?"}`);
    out.push(`- **Sistema:** ${h.os.name}${h.os.version ? ` (${h.os.version})` : ""}`);
    if (h.domain) out.push(`- **Domínio:** ${h.domain}`);
    if (h.interfaces.length) out.push(`- **IPs:** ${h.interfaces.map((i) => `${i.ipv4.join(", ")} (${i.name})`).join("; ")}`);
    if (h.hardware) out.push(`- **Hardware:** ${[h.hardware.manufacturer, h.hardware.model, h.hardware.cpu, h.hardware.memoryGB && `${h.hardware.memoryGB} GB RAM`].filter(Boolean).join(" · ")}`);
    out.push(`- **Coletado em:** ${new Date(h.collectedAt).toLocaleString("pt-BR")}`);
    out.push("");

    if (h.systems.length) {
      out.push("**Sistemas reconhecidos**");
      out.push("");
      out.push("| Sistema | Categoria | Confiança | Evidências |");
      out.push("|---|---|---|---|");
      for (const s of h.systems) out.push(`| ${s.systemName} | ${s.category} | ${s.confidence} | ${s.evidence.join("<br>")} |`);
      out.push("");
    }

    const exposed = h.listeningPorts.filter((p) => !p.address.startsWith("127.") && p.address !== "::1" && p.port < 49152);
    if (exposed.length) {
      const grouped = new Map<string, Set<number>>();
      for (const p of exposed) grouped.set(p.process ?? "?", (grouped.get(p.process ?? "?") ?? new Set()).add(p.port));
      out.push("**Serviços acessíveis pela rede**");
      out.push("");
      for (const [proc, ports] of grouped) out.push(`- ${proc}: ${[...ports].sort((a, b) => a - b).join(", ")}`);
      out.push("");
    }

    out.push(`**Totais:** ${h.software.length} programas · ${h.services.length} serviços · ${h.scheduledTasks.length} tarefas agendadas · ${h.dataSources.length} fontes de dados`);
    if (h.warnings.length) out.push(`\n_Avisos da coleta:_ ${h.warnings.join("; ")}`);
    out.push("");
  }
  return ws.writeContext("10-hosts.md", out.join("\n"));
}
