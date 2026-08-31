import { eq } from "drizzle-orm";
import { expect } from "vitest";

import { encryptValue } from "@/lib/crypto";
import { applyAgentAccessSelection, validateAgentAccessSelection } from "@/modules/agent/access-scope";
import { listAgents } from "@/modules/agent/use-cases";
import { canEditAgentForScope } from "@/modules/agent/use-cases.get-visible-agent-by-id";
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
} from "@/server/infrastructure/db/schema";
import type { IamDatabaseScenarioContext } from "./iam-use-cases-db.context";
import type { IamScenario9State } from "./iam-use-cases-db.scenario-9.part-a";

export async function runIamDatabaseScenario9PartB(
  context: IamDatabaseScenarioContext,
  state: IamScenario9State,
) {
  const { ownerId, memberId, secondProjectId } = context;
  const [rootVersion, specialistVersion] = await db
    .insert(agentVersions)
    .values([
      {
        agentId: state.agent.id,
        versionNumber: 1,
        createdById: ownerId,
      },
      {
        agentId: state.specialist.id,
        versionNumber: 1,
        createdById: ownerId,
      },
    ])
    .returning();
  state.rootVersionId = rootVersion.id;
  state.specialistVersionId = specialistVersion.id;
  await db
    .update(agents)
    .set({ activeVersionId: rootVersion.id })
    .where(eq(agents.id, state.agent.id));
  await db
    .update(agents)
    .set({ activeVersionId: specialistVersion.id })
    .where(eq(agents.id, state.specialist.id));
  await db.insert(agentDelegationBindings).values({
    agentVersionId: rootVersion.id,
    childAgentId: state.specialist.id,
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
  state.knowledgeBaseId = knowledgeBase.id;
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
  state.chunkId = chunk.id;
  await db.insert(agentKnowledgeBindings).values({
    agentVersionId: rootVersion.id,
    knowledgeBaseId: knowledgeBase.id,
  });

  await validateAgentAccessSelection({
    userId: ownerId,
    workspaceId: secondProjectId,
    selection: { scope: "team", teamId: state.teamId },
  });
  await applyAgentAccessSelection({
    agentId: state.agent.id,
    userId: ownerId,
    selection: { scope: "team", teamId: state.teamId },
  });

  expect(
    (await listAgents(secondProjectId, memberId, false)).map(({ id }) => id),
  ).toEqual(expect.arrayContaining([state.agent.id, state.specialist.id]));
  await authorization.invalidatePermissionCache(
    memberId,
    "agent",
    state.agent.id,
  );
  expect(
    await authorization.hasPermission(
      { principalType: "user", principalId: memberId },
      "agents.chat",
      "agent",
      state.agent.id,
    ),
  ).toBe(true);
  await authorization.invalidatePermissionCache(
    memberId,
    "agent",
    state.specialist.id,
  );
  expect(
    await authorization.hasPermission(
      { principalType: "user", principalId: memberId },
      "agents.chat",
      "agent",
      state.specialist.id,
    ),
  ).toBe(true);
  expect(await canEditAgentForScope(state.agent, memberId)).toBe(false);
}
