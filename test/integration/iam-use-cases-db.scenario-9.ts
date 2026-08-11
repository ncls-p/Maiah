import { and, eq, inArray } from "drizzle-orm";
import { expect } from "vitest";

import { encryptValue } from "@/lib/crypto";
import {
  applyAgentAccessSelection,
  getAgentAccessOptions,
  validateAgentAccessSelection,
} from "@/modules/agent/access-scope";
import { listAgents } from "@/modules/agent/use-cases";
import { canEditAgentForScope } from "@/modules/agent/use-cases.get-visible-agent-by-id";
import { replaceDirectResourceSharing } from "@/modules/iam/resource-direct-sharing";
import {
  addOrganizationMember,
  addTeamMember,
  createTeam,
} from "@/modules/iam/use-cases";
import { getKnowledgeBindingsForVersion } from "@/modules/knowledge/use-cases.get-knowledge-bindings-for-version";
import {
  readBoundKnowledgeChunkWindow,
  searchBoundKnowledgeBases,
} from "@/modules/knowledge/use-cases.search-bound-knowledge-bases";
import { addWorkspaceMember } from "@/modules/workspace/use-cases";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  agentDelegationBindings,
  agentKnowledgeBindings,
  agents,
  agentVersions,
  documentChunks,
  documents,
  knowledgeBases,
  roleBindings,
  roles,
} from "@/server/infrastructure/db/schema";
import type { IamDatabaseScenarioContext } from "./iam-use-cases-db.context";

export async function runIamDatabaseScenario9(
  context: IamDatabaseScenarioContext,
) {
  const { ownerId, memberId, memberEmail, secondProjectId, suffix } = context;
  await addOrganizationMember({
    actorUserId: ownerId,
    workspaceId: secondProjectId,
    email: memberEmail,
  });
  await addWorkspaceMember({
    workspaceId: secondProjectId,
    userId: memberId,
    invitedBy: ownerId,
  });
  const team = await createTeam({
    actorUserId: ownerId,
    workspaceId: secondProjectId,
    name: "Assistant users",
  });
  await addTeamMember({
    actorUserId: ownerId,
    workspaceId: secondProjectId,
    teamId: team.id,
    userId: memberId,
  });

  const ownerOptions = await getAgentAccessOptions(ownerId, secondProjectId);
  expect(ownerOptions.scopes).toEqual(
    expect.arrayContaining(["private", "project", "organization", "team"]),
  );
  expect(ownerOptions.teams).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: team.id })]),
  );

  await expect(
    validateAgentAccessSelection({
      userId: memberId,
      workspaceId: secondProjectId,
      selection: { scope: "organization" },
    }),
  ).rejects.toMatchObject({ status: 403 });

  const [agent, specialist] = await db
    .insert(agents)
    .values([
      {
        workspaceId: secondProjectId,
        name: "Team scoped orchestrator",
        slug: `team-scoped-${suffix}`,
        kind: "orchestrator" as const,
        createdById: ownerId,
      },
      {
        workspaceId: secondProjectId,
        name: "Team scoped specialist",
        slug: `team-specialist-${suffix}`,
        createdById: ownerId,
      },
    ])
    .returning();
  const [rootVersion, specialistVersion] = await db
    .insert(agentVersions)
    .values([
      {
        agentId: agent.id,
        versionNumber: 1,
        createdById: ownerId,
      },
      {
        agentId: specialist.id,
        versionNumber: 1,
        createdById: ownerId,
      },
    ])
    .returning();
  await db
    .update(agents)
    .set({ activeVersionId: rootVersion.id })
    .where(eq(agents.id, agent.id));
  await db
    .update(agents)
    .set({ activeVersionId: specialistVersion.id })
    .where(eq(agents.id, specialist.id));
  await db.insert(agentDelegationBindings).values({
    agentVersionId: rootVersion.id,
    childAgentId: specialist.id,
    childAgentVersionId: specialistVersion.id,
  });
  const [knowledgeBase] = await db
    .insert(knowledgeBases)
    .values({
      workspaceId: secondProjectId,
      name: "Direct sharing search regression",
      createdById: ownerId,
    })
    .returning();
  const [document] = await db
    .insert(documents)
    .values({
      workspaceId: secondProjectId,
      knowledgeBaseId: knowledgeBase.id,
      title: "Bali itinerary",
      sourceType: "text",
      status: "ready",
      processingProgress: 100,
      processingStage: "ready",
      createdById: ownerId,
    })
    .returning();
  const [chunk] = await db
    .insert(documentChunks)
    .values({
      documentId: document.id,
      chunkIndex: 0,
      contentEncrypted: await encryptValue(
        "Voyage Bali, Nusa Penida et Gili Meno en ferry.",
      ),
    })
    .returning();
  await db.insert(agentKnowledgeBindings).values({
    agentVersionId: rootVersion.id,
    knowledgeBaseId: knowledgeBase.id,
  });

  await validateAgentAccessSelection({
    userId: ownerId,
    workspaceId: secondProjectId,
    selection: { scope: "team", teamId: team.id },
  });
  await applyAgentAccessSelection({
    agentId: agent.id,
    userId: ownerId,
    selection: { scope: "team", teamId: team.id },
  });

  expect(
    (await listAgents(secondProjectId, memberId, false)).map(({ id }) => id),
  ).toEqual(expect.arrayContaining([agent.id, specialist.id]));
  await authorization.invalidatePermissionCache(memberId, "agent", agent.id);
  expect(
    await authorization.hasPermission(
      { principalType: "user", principalId: memberId },
      "agents.chat",
      "agent",
      agent.id,
    ),
  ).toBe(true);
  await authorization.invalidatePermissionCache(
    memberId,
    "agent",
    specialist.id,
  );
  expect(
    await authorization.hasPermission(
      { principalType: "user", principalId: memberId },
      "agents.chat",
      "agent",
      specialist.id,
    ),
  ).toBe(true);
  expect(await canEditAgentForScope(agent, memberId)).toBe(false);

  await applyAgentAccessSelection({
    agentId: agent.id,
    userId: ownerId,
    selection: { scope: "private" },
  });
  await authorization.invalidatePermissionCache(memberId, "agent", agent.id);
  await authorization.invalidatePermissionCache(
    memberId,
    "agent",
    specialist.id,
  );
  const privateAgentIds = (
    await listAgents(secondProjectId, memberId, false)
  ).map(({ id }) => id);
  expect(privateAgentIds).not.toContain(agent.id);
  expect(privateAgentIds).not.toContain(specialist.id);
  await replaceDirectResourceSharing({
    actorUserId: ownerId,
    workspaceId: secondProjectId,
    resourceType: "agent",
    resourceId: agent.id,
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
        resourceId: knowledgeBase.id,
        roleName: "workspace.viewer",
      }),
    ]),
  );
  expect(
    await authorization.hasDirectPermission(
      { principalType: "user", principalId: memberId },
      "knowledgeBases.viewAllowed",
      "knowledge_base",
      knowledgeBase.id,
      secondProjectId,
    ),
  ).toBe(true);
  await expect(
    getKnowledgeBindingsForVersion(rootVersion.id, {
      workspaceId: secondProjectId,
      userId: memberId,
    }),
  ).resolves.toEqual([
    expect.objectContaining({ knowledgeBaseId: knowledgeBase.id }),
  ]);
  const ownerResults = await searchBoundKnowledgeBases({
    agentVersionId: rootVersion.id,
    workspaceId: secondProjectId,
    knowledgeBaseIds: [knowledgeBase.id],
    query: "Bali",
    userId: ownerId,
  });
  const recipientResults = await searchBoundKnowledgeBases({
    agentVersionId: rootVersion.id,
    workspaceId: secondProjectId,
    knowledgeBaseIds: [knowledgeBase.id],
    query: "Bali",
    userId: memberId,
  });
  expect(recipientResults).toEqual(ownerResults);
  expect(recipientResults).toEqual([
    expect.objectContaining({
      chunkId: chunk.id,
      knowledgeBaseId: knowledgeBase.id,
      content: expect.stringContaining("Nusa Penida"),
    }),
  ]);
  await expect(
    readBoundKnowledgeChunkWindow({
      agentVersionId: rootVersion.id,
      workspaceId: secondProjectId,
      userId: memberId,
      chunkId: chunk.id,
      before: 0,
      after: 0,
    }),
  ).resolves.toEqual(
    expect.objectContaining({
      anchorChunkId: chunk.id,
      knowledgeBaseId: knowledgeBase.id,
    }),
  );
  await replaceDirectResourceSharing({
    actorUserId: ownerId,
    workspaceId: secondProjectId,
    resourceType: "agent",
    resourceId: agent.id,
    userIds: [],
    includeDependencies: true,
  });
  await expect(
    searchBoundKnowledgeBases({
      agentVersionId: rootVersion.id,
      workspaceId: secondProjectId,
      knowledgeBaseIds: [knowledgeBase.id],
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
        eq(roleBindings.resourceId, agent.id),
        eq(roles.name, "workspace.agent_user"),
      ),
    )
    .limit(1);
  expect(remainingBinding).toBeUndefined();
  await db
    .update(agents)
    .set({ activeVersionId: null })
    .where(inArray(agents.id, [agent.id, specialist.id]));
  await db
    .delete(agentVersions)
    .where(inArray(agentVersions.id, [rootVersion.id, specialistVersion.id]));
  await db.delete(agents).where(inArray(agents.id, [agent.id, specialist.id]));
  await db
    .delete(knowledgeBases)
    .where(eq(knowledgeBases.id, knowledgeBase.id));
}
