import { and, eq, inArray } from "drizzle-orm";
import { expect } from "vitest";

import { applyAgentAccessSelection } from "@/modules/agent/access-scope";
import { listAgents } from "@/modules/agent/use-cases";
import { replaceDirectResourceSharing } from "@/modules/iam/resource-direct-sharing";
import { getKnowledgeBindingsForVersion } from "@/modules/knowledge/use-cases.get-knowledge-bindings-for-version";
import {
  readBoundKnowledgeChunkWindow,
  searchBoundKnowledgeBases,
} from "@/modules/knowledge/use-cases.search-bound-knowledge-bases";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  agentVersions,
  knowledgeBases,
  roleBindings,
  roles,
} from "@/server/infrastructure/db/schema";
import type { IamDatabaseScenarioContext } from "./iam-use-cases-db.context";
import type { IamScenario9State } from "./iam-use-cases-db.scenario-9.part-a";

export async function runIamDatabaseScenario9PartC(
  context: IamDatabaseScenarioContext,
  state: IamScenario9State,
) {
  const { ownerId, memberId, secondProjectId } = context;
  await applyAgentAccessSelection({
    agentId: state.agent.id,
    userId: ownerId,
    selection: { scope: "private" },
  });
  await authorization.invalidatePermissionCache(
    memberId,
    "agent",
    state.agent.id,
  );
  await authorization.invalidatePermissionCache(
    memberId,
    "agent",
    state.specialist.id,
  );
  const privateAgentIds = (
    await listAgents(secondProjectId, memberId, false)
  ).map(({ id }) => id);
  expect(privateAgentIds).not.toContain(state.agent.id);
  expect(privateAgentIds).not.toContain(state.specialist.id);
  await replaceDirectResourceSharing({
    actorUserId: ownerId,
    workspaceId: secondProjectId,
    resourceType: "agent",
    resourceId: state.agent.id,
    userIds: [memberId],
    includeDependencies: true,
  });
  const directGrants = await db
    .select({
      resourceType: roleBindings.resourceType,
      resourceId: roleBindings.resourceId,
      roleName: roles.name,
    })
    .from(roleBindings)
    .innerJoin(roles, eq(roleBindings.roleId, roles.id))
    .where(
      and(
        eq(roleBindings.principalType, "user"),
        eq(roleBindings.principalId, memberId),
      ),
    );
  expect(directGrants).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        resourceType: "knowledge_base",
        resourceId: state.knowledgeBaseId,
        roleName: "workspace.viewer",
      }),
    ]),
  );
  expect(
    await authorization.hasDirectPermission(
      { principalType: "user", principalId: memberId },
      "knowledgeBases.viewAllowed",
      "knowledge_base",
      state.knowledgeBaseId,
      secondProjectId,
    ),
  ).toBe(true);
  await expect(
    getKnowledgeBindingsForVersion(state.rootVersionId, {
      workspaceId: secondProjectId,
      userId: memberId,
    }),
  ).resolves.toEqual([
    expect.objectContaining({ knowledgeBaseId: state.knowledgeBaseId }),
  ]);
  const ownerResults = await searchBoundKnowledgeBases({
    agentVersionId: state.rootVersionId,
    workspaceId: secondProjectId,
    knowledgeBaseIds: [state.knowledgeBaseId],
    query: "Bali",
    userId: ownerId,
  });
  const recipientResults = await searchBoundKnowledgeBases({
    agentVersionId: state.rootVersionId,
    workspaceId: secondProjectId,
    knowledgeBaseIds: [state.knowledgeBaseId],
    query: "Bali",
    userId: memberId,
  });
  expect(recipientResults).toEqual(ownerResults);
  expect(recipientResults).toEqual([
    expect.objectContaining({
      chunkId: state.chunkId,
      knowledgeBaseId: state.knowledgeBaseId,
      content: expect.stringContaining("Nusa Penida"),
    }),
  ]);
  await expect(
    readBoundKnowledgeChunkWindow({
      agentVersionId: state.rootVersionId,
      workspaceId: secondProjectId,
      userId: memberId,
      chunkId: state.chunkId,
      before: 0,
      after: 0,
    }),
  ).resolves.toEqual(
    expect.objectContaining({
      anchorChunkId: state.chunkId,
      knowledgeBaseId: state.knowledgeBaseId,
    }),
  );
  await replaceDirectResourceSharing({
    actorUserId: ownerId,
    workspaceId: secondProjectId,
    resourceType: "agent",
    resourceId: state.agent.id,
    userIds: [],
    includeDependencies: true,
  });
  await expect(
    searchBoundKnowledgeBases({
      agentVersionId: state.rootVersionId,
      workspaceId: secondProjectId,
      knowledgeBaseIds: [state.knowledgeBaseId],
      query: "Bali",
      userId: memberId,
    }),
  ).resolves.toEqual([]);

  const [remainingBinding] = await db
    .select({ id: roleBindings.id })
    .from(roleBindings)
    .innerJoin(roles, eq(roleBindings.roleId, roles.id))
    .where(
      and(
        eq(roleBindings.resourceId, state.agent.id),
        eq(roles.name, "workspace.agent_user"),
      ),
    )
    .limit(1);
  expect(remainingBinding).toBeUndefined();
  await db
    .update(agents)
    .set({ activeVersionId: null })
    .where(inArray(agents.id, [state.agent.id, state.specialist.id]));
  await db
    .delete(agentVersions)
    .where(
      inArray(agentVersions.id, [
        state.rootVersionId,
        state.specialistVersionId,
      ]),
    );
  await db.delete(agents).where(
    inArray(agents.id, [state.agent.id, state.specialist.id]),
  );
  await db
    .delete(knowledgeBases)
    .where(eq(knowledgeBases.id, state.knowledgeBaseId));
}
