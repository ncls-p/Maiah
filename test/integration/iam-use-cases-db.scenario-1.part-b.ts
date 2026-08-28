import { expect } from "vitest";

import { listAgents } from "@/modules/agent/use-cases";
import { deleteProjectAccessResource } from "@/modules/iam/resource-deletion";
import { assignResourceRole } from "@/modules/iam/use-cases";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  aiModels,
  aiProviders,
} from "@/server/infrastructure/db/schema";
import type { IamDatabaseScenarioContext } from "./iam-use-cases-db.context";
import type { IamScenario1State } from "./iam-use-cases-db.scenario-1.part-a";

export async function runIamDatabaseScenario1PartB(
  context: IamDatabaseScenarioContext,
  state: IamScenario1State,
) {
  const { ownerId, memberId, suffix } = context;
  const [sharedAgent, privateAgent] = await db
    .insert(agents)
    .values([
      {
        workspaceId: state.secondProjectId,
        name: "Shared assistant",
        slug: `shared-${suffix}`,
        createdById: ownerId,
      },
      {
        workspaceId: state.secondProjectId,
        name: "Private assistant",
        slug: `private-${suffix}`,
        createdById: ownerId,
      },
    ])
    .returning();
  state.sharedAgentId = sharedAgent.id;
  state.privateAgentId = privateAgent.id;
  const [memberOwnedAgent] = await db
    .insert(agents)
    .values({
      workspaceId: state.secondProjectId,
      name: "Member private assistant",
      slug: `member-private-${suffix}`,
      createdById: memberId,
    })
    .returning();
  state.memberOwnedAgentId = memberOwnedAgent.id;
  expect(
    (await listAgents(state.secondProjectId, ownerId, true)).map(
      ({ id }) => id,
    ),
  ).not.toContain(memberOwnedAgent.id);
  await assignResourceRole({
    actorUserId: ownerId,
    workspaceId: state.secondProjectId,
    principalType: "user",
    principalId: ownerId,
    roleId: state.resourceRoleId,
    resourceType: "agent",
    resourceId: memberOwnedAgent.id,
  });
  expect(
    (await listAgents(state.secondProjectId, ownerId, true)).map(
      ({ id }) => id,
    ),
  ).toContain(memberOwnedAgent.id);
  await deleteProjectAccessResource({
    actorUserId: ownerId,
    workspaceId: state.secondProjectId,
    resourceType: "agent",
    resourceId: memberOwnedAgent.id,
  });
  expect(
    (await listAgents(state.secondProjectId, ownerId, true)).map(
      ({ id }) => id,
    ),
  ).not.toContain(memberOwnedAgent.id);
  await assignResourceRole({
    actorUserId: ownerId,
    workspaceId: state.secondProjectId,
    principalType: "user",
    principalId: memberId,
    roleId: state.resourceRoleId,
    resourceType: "agent",
    resourceId: sharedAgent.id,
  });
  expect(
    await authorization.hasPermission(
      { principalType: "user", principalId: memberId },
      "agents.get",
      "agent",
      sharedAgent.id,
    ),
  ).toBe(true);
  expect(
    await authorization.hasPermission(
      { principalType: "user", principalId: memberId },
      "agents.get",
      "agent",
      privateAgent.id,
    ),
  ).toBe(false);
  const [provider] = await db
    .insert(aiProviders)
    .values({
      workspaceId: state.secondProjectId,
      kind: "openai-compatible",
      name: "Scoped provider",
      authType: "bearer",
      createdById: ownerId,
    })
    .returning();
  state.providerId = provider.id;
  const [model] = await db
    .insert(aiModels)
    .values({
      providerId: provider.id,
      modelId: "scoped-model",
      displayName: "Scoped model",
    })
    .returning();
  state.modelId = model.id;
}
