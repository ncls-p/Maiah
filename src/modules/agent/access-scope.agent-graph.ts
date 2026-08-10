import type { db } from "@/server/infrastructure/db";
import {
  agentDelegationBindings,
  agents,
} from "@/server/infrastructure/db/schema";
import { eq, inArray } from "drizzle-orm";

export class AgentAccessError extends Error {
  constructor(
    message: string,
    readonly status = 403,
  ) {
    super(message);
    this.name = "AgentAccessError";
  }
}

export type AccessExecutor = Pick<
  typeof db,
  "delete" | "insert" | "select" | "update"
>;

export async function loadAgentGraphIds(
  rootAgentId: string,
  executor: AccessExecutor,
) {
  const [root] = await executor
    .select({ activeVersionId: agents.activeVersionId })
    .from(agents)
    .where(eq(agents.id, rootAgentId))
    .limit(1);
  const pending = root?.activeVersionId ? [root.activeVersionId] : [];
  const agentIds = new Set([rootAgentId]);
  const visitedVersions = new Set<string>();
  while (pending.length > 0) {
    const versionId = pending.shift();
    if (!versionId || visitedVersions.has(versionId)) continue;
    visitedVersions.add(versionId);
    if (visitedVersions.size > 256)
      throw new AgentAccessError(
        "Delegation graph is too large to share safely",
        400,
      );
    const bindings = await executor
      .select({
        childAgentId: agentDelegationBindings.childAgentId,
        childAgentVersionId: agentDelegationBindings.childAgentVersionId,
      })
      .from(agentDelegationBindings)
      .where(eq(agentDelegationBindings.agentVersionId, versionId));
    for (const binding of bindings) {
      agentIds.add(binding.childAgentId);
      pending.push(binding.childAgentVersionId);
    }
  }
  return [...agentIds];
}

export async function loadOwnedAgentGraph(
  rootAgentId: string,
  userId: string,
  executor: AccessExecutor,
) {
  const agentIds = await loadAgentGraphIds(rootAgentId, executor);
  if (agentIds.length === 1) return agentIds;
  const rows = await executor
    .select({
      id: agents.id,
      createdById: agents.createdById,
      isGlobal: agents.isGlobal,
      sharingMode: agents.sharingMode,
    })
    .from(agents)
    .where(inArray(agents.id, agentIds));
  const unavailable = rows.find(
    (agent) =>
      agent.id !== rootAgentId &&
      agent.createdById !== userId &&
      !agent.isGlobal &&
      agent.sharingMode !== "marketplace",
  );
  if (unavailable) {
    throw new AgentAccessError(
      "A delegated assistant cannot be shared because you do not own it",
      400,
    );
  }
  return rows
    .filter((agent) => agent.id === rootAgentId || agent.createdById === userId)
    .map((agent) => agent.id);
}
