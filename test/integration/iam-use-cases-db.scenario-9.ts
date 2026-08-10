import { and, eq, inArray } from "drizzle-orm";
import { expect } from "vitest";

import {
  applyAgentAccessSelection,
  getAgentAccessOptions,
  validateAgentAccessSelection,
} from "@/modules/agent/access-scope";
import { listAgents } from "@/modules/agent/use-cases";
import {
  addOrganizationMember,
  addTeamMember,
  createTeam,
} from "@/modules/iam/use-cases";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  agentDelegationBindings,
  agents,
  agentVersions,
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
  expect(
    await authorization.hasPermission(
      { principalType: "user", principalId: memberId },
      "agents.update",
      "agent",
      agent.id,
    ),
  ).toBe(false);

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
}
