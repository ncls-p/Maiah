import {
  agentDelegationBindings,
  agentKnowledgeBindings,
  agentSkillBindings,
  agentToolBindings,
  agentVersions,
  agents,
  userAgentPreferences,
} from "@/server/infrastructure/db/schema";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { WorkspaceCloneContext } from "./workspace-clone.context";

export async function cloneAgents(context: WorkspaceCloneContext) {
  const {
    tx,
    input,
    suffix,
    providerMap,
    modelMap,
    mcpToolMap,
    customToolMap,
    knowledgeMap,
    skillMap,
    agentMap,
    versionMap,
  } = context;
  const sourceAgents = await tx
    .select()
    .from(agents)
    .where(eq(agents.workspaceId, input.sourceWorkspaceId));
  for (const source of sourceAgents) {
    const id = randomUUID();
    agentMap.set(source.id, id);
    await tx.insert(agents).values({
      ...source,
      id,
      workspaceId: input.targetWorkspaceId,
      slug: `${source.slug}-${suffix}`,
      activeVersionId: null,
      forkedFromAgentId: source.id,
      sourceType: "fork",
      createdById: input.actorUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  if (sourceAgents.length > 0) {
    const sourceVersions = await tx
      .select()
      .from(agentVersions)
      .where(
        inArray(
          agentVersions.agentId,
          sourceAgents.map(({ id }) => id),
        ),
      );
    for (const source of sourceVersions) {
      const id = randomUUID();
      versionMap.set(source.id, id);
      await tx.insert(agentVersions).values({
        ...source,
        id,
        agentId: agentMap.get(source.agentId)!,
        providerId: source.providerId
          ? (providerMap.get(source.providerId) ?? null)
          : null,
        modelId: source.modelId ? (modelMap.get(source.modelId) ?? null) : null,
        createdById: input.actorUserId,
        createdAt: new Date(),
      });
    }
    for (const source of sourceAgents) {
      await tx
        .update(agents)
        .set({
          activeVersionId: source.activeVersionId
            ? (versionMap.get(source.activeVersionId) ?? null)
            : null,
        })
        .where(eq(agents.id, agentMap.get(source.id)!));
    }
    const versionIds = sourceVersions.map(({ id }) => id);
    const [toolBindings, knowledgeBindings, skillBindings, delegationBindings] =
      await Promise.all([
        tx
          .select()
          .from(agentToolBindings)
          .where(inArray(agentToolBindings.agentVersionId, versionIds)),
        tx
          .select()
          .from(agentKnowledgeBindings)
          .where(inArray(agentKnowledgeBindings.agentVersionId, versionIds)),
        tx
          .select()
          .from(agentSkillBindings)
          .where(inArray(agentSkillBindings.agentVersionId, versionIds)),
        tx
          .select()
          .from(agentDelegationBindings)
          .where(inArray(agentDelegationBindings.agentVersionId, versionIds)),
      ]);
    for (const source of toolBindings) {
      const mappedToolId =
        source.toolSource === "mcp"
          ? mcpToolMap.get(source.toolId)
          : source.toolSource === "custom"
            ? customToolMap.get(source.toolId)
            : source.toolId;
      if (mappedToolId)
        await tx.insert(agentToolBindings).values({
          ...source,
          id: randomUUID(),
          agentVersionId: versionMap.get(source.agentVersionId)!,
          toolId: mappedToolId,
          createdAt: new Date(),
        });
    }
    for (const source of knowledgeBindings)
      await tx.insert(agentKnowledgeBindings).values({
        ...source,
        id: randomUUID(),
        agentVersionId: versionMap.get(source.agentVersionId)!,
        knowledgeBaseId: knowledgeMap.get(source.knowledgeBaseId)!,
        createdAt: new Date(),
      });
    for (const source of skillBindings)
      await tx.insert(agentSkillBindings).values({
        ...source,
        id: randomUUID(),
        agentVersionId: versionMap.get(source.agentVersionId)!,
        skillId: skillMap.get(source.skillId)!,
        createdAt: new Date(),
      });
    for (const source of delegationBindings) {
      const childAgentId = agentMap.get(source.childAgentId);
      const childVersionId = versionMap.get(source.childAgentVersionId);
      if (childAgentId && childVersionId)
        await tx.insert(agentDelegationBindings).values({
          ...source,
          id: randomUUID(),
          agentVersionId: versionMap.get(source.agentVersionId)!,
          childAgentId,
          childAgentVersionId: childVersionId,
          createdAt: new Date(),
        });
    }
  }
  const sourceAgentPreferences = await tx
    .select()
    .from(userAgentPreferences)
    .where(eq(userAgentPreferences.workspaceId, input.sourceWorkspaceId));
  for (const source of sourceAgentPreferences) {
    await tx
      .insert(userAgentPreferences)
      .values({
        ...source,
        id: randomUUID(),
        workspaceId: input.targetWorkspaceId,
        defaultAgentId: source.defaultAgentId
          ? (agentMap.get(source.defaultAgentId) ?? null)
          : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }
}
