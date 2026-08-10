import type { AgentExecutionUsage } from "./runtime-executor.heartbeat-ms";

export function recordAgentExecutionUsage(
  budget: { usageBreakdown?: AgentExecutionUsage[] },
  usage: AgentExecutionUsage,
) {
  const breakdown = (budget.usageBreakdown ??= []);
  breakdown.push(usage);
  return [...breakdown];
}
