import { parseAgentToolDisplayContext } from "@/modules/agent/tool-progress-payload";

export type AgentProgressModelHistoryKind = "visual-only" | "delegation-result";

export type AgentProgressModelHistoryProjection =
  | { kind: "visual-only" }
  | { kind: "delegation-result"; text: string }
  | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function delegationFinalTextFromOutput(output: unknown): string | null {
  if (!isRecord(output)) return null;
  return typeof output.result === "string" ? output.result : null;
}

/**
 * Separates the durable UI trace from the context reconstructed for a later
 * orchestrator turn. Child actions are visual-only; a root delegation exposes
 * only the child's bounded final text and no run, agent, task, or tool details.
 */
export function projectAgentProgressForModelHistory(
  metadata: unknown,
): AgentProgressModelHistoryProjection {
  if (!isRecord(metadata)) return null;
  const context = parseAgentToolDisplayContext(metadata.agentContext);
  if (!context) return null;

  if (context.depth > 0) return { kind: "visual-only" };
  if (metadata.modelHistoryKind === "visual-only") {
    return { kind: "visual-only" };
  }
  if (metadata.modelHistoryKind !== "delegation-result") return null;
  if (context.status !== "success") return { kind: "visual-only" };

  const text = delegationFinalTextFromOutput(metadata.output);
  return text === null
    ? { kind: "visual-only" }
    : { kind: "delegation-result", text };
}
