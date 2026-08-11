import { eq, inArray } from "drizzle-orm";

import { type AccessResourceType } from "@/server/domain/entities/access-resource";
import { db } from "@/server/infrastructure/db";
import {
  agentDelegationBindings,
  agentKnowledgeBindings,
  agentSkillBindings,
  agentToolBindings,
  agentVersions,
  agents,
  mcpTools,
} from "@/server/infrastructure/db/schema";

export type SharedResourceTarget = {
  type: AccessResourceType;
  id: string;
};

function targetKey(target: SharedResourceTarget) {
  return `${target.type}:${target.id}`;
}

/**
 * Returns the resource itself and the runtime dependencies required to use a
 * shared assistant. User-owned connector credentials are intentionally not
 * included: each recipient must configure their own tool connection.
 */
export async function listResourceShareTargets(input: {
  resourceType: AccessResourceType;
  resourceId: string;
  includeDependencies?: boolean;
}): Promise<SharedResourceTarget[]> {
  const targets = new Map<string, SharedResourceTarget>();
  const add = (type: AccessResourceType, id: string | null | undefined) => {
    if (!id) return;
    const target = { type, id };
    targets.set(targetKey(target), target);
  };

  add(input.resourceType, input.resourceId);
  if (!input.includeDependencies || input.resourceType !== "agent") {
    return [...targets.values()];
  }

  const [root] = await db
    .select({ activeVersionId: agents.activeVersionId })
    .from(agents)
    .where(eq(agents.id, input.resourceId));
  let pendingVersionIds = root?.activeVersionId ? [root.activeVersionId] : [];
  const visitedVersionIds = new Set<string>();

  for (let depth = 0; pendingVersionIds.length > 0 && depth < 20; depth += 1) {
    const versionIds = pendingVersionIds.filter(
      (id) => !visitedVersionIds.has(id),
    );
    if (versionIds.length === 0) break;
    versionIds.forEach((id) => visitedVersionIds.add(id));

    const [versions, knowledge, skills, delegations, tools] = await Promise.all(
      [
        db
          .select({
            providerId: agentVersions.providerId,
            modelId: agentVersions.modelId,
          })
          .from(agentVersions)
          .where(inArray(agentVersions.id, versionIds)),
        db
          .select({ id: agentKnowledgeBindings.knowledgeBaseId })
          .from(agentKnowledgeBindings)
          .where(inArray(agentKnowledgeBindings.agentVersionId, versionIds)),
        db
          .select({ id: agentSkillBindings.skillId })
          .from(agentSkillBindings)
          .where(inArray(agentSkillBindings.agentVersionId, versionIds)),
        db
          .select({
            agentId: agentDelegationBindings.childAgentId,
            versionId: agentDelegationBindings.childAgentVersionId,
          })
          .from(agentDelegationBindings)
          .where(inArray(agentDelegationBindings.agentVersionId, versionIds)),
        db
          .select({
            source: agentToolBindings.toolSource,
            id: agentToolBindings.toolId,
          })
          .from(agentToolBindings)
          .where(inArray(agentToolBindings.agentVersionId, versionIds)),
      ],
    );

    versions.forEach((version) => {
      add("provider", version.providerId);
      add("model", version.modelId);
    });
    knowledge.forEach(({ id }) => add("knowledge_base", id));
    skills.forEach(({ id }) => add("skill", id));
    delegations.forEach(({ agentId }) => add("agent", agentId));
    tools
      .filter(({ source }) => source === "custom")
      .forEach(({ id }) => add("custom_tool", id));

    const mcpToolIds = tools
      .filter(({ source }) => source === "mcp")
      .map(({ id }) => id);
    if (mcpToolIds.length > 0) {
      const servers = await db
        .select({ id: mcpTools.mcpServerId })
        .from(mcpTools)
        .where(inArray(mcpTools.id, mcpToolIds));
      servers.forEach(({ id }) => add("mcp_server", id));
    }

    pendingVersionIds = delegations.map(({ versionId }) => versionId);
  }

  return [...targets.values()];
}
