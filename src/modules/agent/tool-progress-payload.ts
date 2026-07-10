export const agentToolContextKey = "agentContext" as const;

export type AgentToolDisplayContext = {
  agentId: string;
  agentName: string;
  runId: string;
  parentRunId?: string;
  depth: number;
  status: "running" | "success" | "error";
  durationMs?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Accepts only the server-owned top-level metadata attached to a tool part.
 * Tool input and output are intentionally never inspected for provenance.
 */
export function parseAgentToolDisplayContext(
  context: unknown,
): AgentToolDisplayContext | null {
  if (
    !isRecord(context) ||
    typeof context.agentId !== "string" ||
    typeof context.agentName !== "string" ||
    typeof context.runId !== "string" ||
    !Number.isInteger(context.depth) ||
    Number(context.depth) < 0 ||
    (context.parentRunId !== undefined &&
      typeof context.parentRunId !== "string") ||
    (context.durationMs !== undefined &&
      (typeof context.durationMs !== "number" ||
        !Number.isFinite(context.durationMs) ||
        context.durationMs < 0)) ||
    typeof context.status !== "string" ||
    !["running", "success", "error"].includes(context.status)
  ) {
    return null;
  }

  return context as AgentToolDisplayContext;
}
