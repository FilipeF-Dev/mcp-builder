/**
 * Ferramentas que o servidor MCP gerado pode oferecer ao agente.
 * Cada uma precisa ser APROVADA pelo TI para ficar disponível.
 * O código de cada ferramenta está em templates/servidor-mcp/servidor.js.
 */
export interface ToolInfo {
  id: string;
  title: string;
  /** Explicação em linguagem simples, para quem aprova. */
  what: string;
  /** Somente leitura? (hoje, todas são) */
  readOnly: boolean;
  /** Aumente quando o COMPORTAMENTO da ferramenta mudar: ela volta para revisão do TI. */
  revision: number;
}

/** Aumente ao mudar o código do servidor: os servidores entregues são refeitos (sem exigir nova aprovação). */
export const SERVER_REVISION = 2;

export const TOOLS: ToolInfo[] = [
  { id: "buscar_conhecimento", title: "Buscar no conhecimento", what: "Procura nas skills aprovadas e no perfil da empresa os trechos que respondem a uma dúvida.", readOnly: true, revision: 1 },
  { id: "listar_skills", title: "Listar skills", what: "Mostra ao agente quais skills aprovadas existem e quando usar cada uma.", readOnly: true, revision: 1 },
  { id: "ler_skill", title: "Ler uma skill", what: "Entrega ao agente o texto completo de uma skill aprovada.", readOnly: true, revision: 1 },
  { id: "regras_de_seguranca", title: "Regras de segurança", what: "Entrega ao agente as regras que ele nunca pode quebrar.", readOnly: true, revision: 1 },
  { id: "preparar_chamado", title: "Preparar chamado", what: "Monta o texto de um chamado para o colaborador abrir. Não abre o chamado sozinho.", readOnly: true, revision: 1 },
];
