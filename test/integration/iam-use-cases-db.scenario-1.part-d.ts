import { and, eq } from "drizzle-orm";
import { expect } from "vitest";

import {
  deleteCustomRole,
  deleteTeam,
  getAccessConsoleSnapshot,
  removeOrganizationMember,
  removeRoleAssignment,
  removeTeamMember,
} from "@/modules/iam/use-cases";
import { db } from "@/server/infrastructure/db";
import { roleBindings } from "@/server/infrastructure/db/schema";
import type { IamDatabaseScenarioContext } from "./iam-use-cases-db.context";
import type { IamScenario1State } from "./iam-use-cases-db.scenario-1.part-a";

export async function runIamDatabaseScenario1PartD(
  context: IamDatabaseScenarioContext,
  state: IamScenario1State,
) {
  const { ownerId, memberId } = context;
  const [teamBinding] = await db
    .select({ id: roleBindings.id })
    .from(roleBindings)
    .where(
      and(
        eq(roleBindings.principalType, "group"),
        eq(roleBindings.principalId, state.teamId),
        eq(roleBindings.roleId, state.projectRoleId),
      ),
    )
    .limit(1);

  await removeRoleAssignment({
    actorUserId: ownerId,
    workspaceId: state.secondProjectId,
    bindingId: teamBinding.id,
  });
  await deleteCustomRole({
    actorUserId: ownerId,
    workspaceId: state.secondProjectId,
    roleId: state.projectRoleId,
  });
  const [resourceBinding] = await db
    .select({ id: roleBindings.id })
    .from(roleBindings)
    .where(
      and(
        eq(roleBindings.principalType, "user"),
        eq(roleBindings.principalId, memberId),
        eq(roleBindings.roleId, state.resourceRoleId),
        eq(roleBindings.resourceType, "agent"),
        eq(roleBindings.resourceId, state.sharedAgentId),
      ),
    )
    .limit(1);
  await removeRoleAssignment({
    actorUserId: ownerId,
    workspaceId: state.secondProjectId,
    bindingId: resourceBinding.id,
  });
  await deleteCustomRole({
    actorUserId: ownerId,
    workspaceId: state.secondProjectId,
    roleId: state.resourceRoleId,
  });
  const [modelBinding] = await db
    .select({ id: roleBindings.id })
    .from(roleBindings)
    .where(
      and(
        eq(roleBindings.principalType, "user"),
        eq(roleBindings.principalId, memberId),
        eq(roleBindings.roleId, state.modelRoleId),
        eq(roleBindings.resourceType, "provider"),
        eq(roleBindings.resourceId, state.providerId),
      ),
    )
    .limit(1);
  await removeRoleAssignment({
    actorUserId: ownerId,
    workspaceId: state.secondProjectId,
    bindingId: modelBinding.id,
  });
  await deleteCustomRole({
    actorUserId: ownerId,
    workspaceId: state.secondProjectId,
    roleId: state.modelRoleId,
  });
  await removeTeamMember({
    actorUserId: ownerId,
    workspaceId: state.firstProjectId,
    teamId: state.teamId,
    userId: memberId,
  });
  await deleteTeam({
    actorUserId: ownerId,
    workspaceId: state.firstProjectId,
    teamId: state.teamId,
  });
  await removeOrganizationMember({
    actorUserId: ownerId,
    workspaceId: state.firstProjectId,
    userId: memberId,
  });

  await expect(
    getAccessConsoleSnapshot({
      userId: memberId,
      workspaceId: state.firstProjectId,
    }),
  ).rejects.toMatchObject({ status: 403 });
}
