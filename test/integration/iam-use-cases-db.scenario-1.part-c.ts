import { expect } from "vitest";

import {
  assignResourceRole,
  assignRole,
  createCustomRole,
  getAccessConsoleSnapshot,
  updateCustomRole,
} from "@/modules/iam/use-cases";
import { authorization } from "@/server/domain/services/authorization";
import type { IamDatabaseScenarioContext } from "./iam-use-cases-db.context";
import type { IamScenario1State } from "./iam-use-cases-db.scenario-1.part-a";

export async function runIamDatabaseScenario1PartC(
  context: IamDatabaseScenarioContext,
  state: IamScenario1State,
) {
  const { ownerId, memberId } = context;
  const modelRole = await createCustomRole({
    actorUserId: ownerId,
    workspaceId: state.secondProjectId,
    displayName: "Model User",
    scopeType: "workspace",
    permissions: ["models.view", "models.invoke"],
  });
  state.modelRoleId = modelRole.id;
  await assignResourceRole({
    actorUserId: ownerId,
    workspaceId: state.secondProjectId,
    principalType: "user",
    principalId: memberId,
    roleId: modelRole.id,
    resourceType: "provider",
    resourceId: state.providerId,
  });
  expect(
    await authorization.hasPermission(
      { principalType: "user", principalId: memberId },
      "models.invoke",
      "model",
      state.modelId,
    ),
  ).toBe(true);

  await assignRole({
    actorUserId: ownerId,
    workspaceId: state.secondProjectId,
    principalType: "group",
    principalId: state.teamId,
    roleId: state.projectRoleId,
    scopeType: "workspace",
  });
  const updatedProjectRole = await updateCustomRole({
    actorUserId: ownerId,
    workspaceId: state.secondProjectId,
    roleId: state.projectRoleId,
    displayName: "Support Operator",
    description: "Read assistants and run workflows",
    permissions: ["agents.get", "workflows.view", "workflows.execute"],
  });
  expect(updatedProjectRole).toMatchObject({
    displayName: "Support Operator",
    permissionsJson: ["agents.get", "workflows.view", "workflows.execute"],
  });

  const snapshot = await getAccessConsoleSnapshot({
    userId: ownerId,
    workspaceId: state.secondProjectId,
  });

  expect(snapshot.organization.id).toBe(state.organizationId);
  expect(snapshot.projects.map(({ id }) => id)).toEqual(
    expect.arrayContaining([state.firstProjectId, state.secondProjectId]),
  );
  expect(snapshot.capabilities).toEqual({
    canManageProjectAccess: true,
    canManageOrganizationAccess: true,
    canCreateProjects: true,
    canManageProjectLifecycle: true,
    canManageOrganizationLifecycle: true,
    canManageMembers: true,
    canManageTeams: true,
  });
  expect(snapshot.assignments).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        principalId: ownerId,
        roleKey: "organization.owner",
        inherited: true,
      }),
      expect.objectContaining({
        principalId: state.teamId,
        roleId: state.projectRoleId,
        scope: "project",
      }),
    ]),
  );
  expect(
    snapshot.roles.find(({ id }) => id === state.projectRoleId),
  ).toMatchObject({
    displayName: "Support Operator",
    permissions: ["agents.get", "workflows.view", "workflows.execute"],
  });
}
