import { and,eq } from "drizzle-orm";

import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import { organizationMembers,roleBindings,roles,teamMembers,teams } from "@/server/infrastructure/db/schema";
import { AssignmentPrincipalType,getWorkspaceScope,IamOperationError,invalidateUserOrganizationAccess,requireDelegablePermissions,requirePermission,rolePermissions,ScopeType } from "./use-cases.iam-operation-error";

export async function validateAssignmentPrincipal(input: { organizationId: string; principalType: AssignmentPrincipalType; principalId: string }) {
  if (input.principalType === "user") {
    const [member] = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, input.principalId), eq(organizationMembers.status, "active")))
      .limit(1);
    return Boolean(member);
  }

  const [team] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.organizationId, input.organizationId), eq(teams.id, input.principalId)))
    .limit(1);
  return Boolean(team);
}

export async function assignRole(input: { actorUserId: string; workspaceId: string; principalType: AssignmentPrincipalType; principalId: string; roleId: string; scopeType: ScopeType }) {
  const { organization } = await getWorkspaceScope(input.workspaceId);
  const [role] = await db.select().from(roles).where(eq(roles.id, input.roleId)).limit(1);
  if (!role || role.scopeType !== input.scopeType || (!role.isSystem && !((input.scopeType === "organization" && role.ownerResourceType === "organization" && role.ownerResourceId === organization.id) || (input.scopeType === "workspace" && role.ownerResourceType === "workspace" && role.ownerResourceId === input.workspaceId)))) {
    throw new IamOperationError("This role cannot be used at this scope");
  }
  await requirePermission({
    userId: input.actorUserId,
    permission: "roles.manage",
    resourceType: input.scopeType,
    resourceId: input.scopeType === "organization" ? organization.id : input.workspaceId,
    errorMessage: input.scopeType === "organization" ? "You do not have permission to assign organization roles" : "You do not have permission to assign project roles",
  });
  await requireDelegablePermissions({
    actorUserId: input.actorUserId,
    resourceType: input.scopeType,
    resourceId: input.scopeType === "organization" ? organization.id : input.workspaceId,
    permissions: rolePermissions(role),
  });
  if (role.name === "organization.owner" && input.principalType !== "user") {
    throw new IamOperationError("Organization ownership must be assigned to a member directly");
  }
  if (
    !(await validateAssignmentPrincipal({
      organizationId: organization.id,
      principalType: input.principalType,
      principalId: input.principalId,
    }))
  ) {
    throw new IamOperationError("The selected member or team is outside this organization");
  }

  const resourceId = input.scopeType === "organization" ? organization.id : input.workspaceId;
  await db
    .insert(roleBindings)
    .values({
      principalType: input.principalType,
      principalId: input.principalId,
      roleId: role.id,
      resourceType: input.scopeType,
      resourceId,
      createdById: input.actorUserId,
    })
    .onConflictDoNothing();

  const affectedUserIds = input.principalType === "user" ? [input.principalId] : (await db.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, input.principalId))).map(({ userId }) => userId);
  await Promise.all(affectedUserIds.map((userId) => invalidateUserOrganizationAccess(userId, organization.id)));
  await audit.emit({
    organizationId: organization.id,
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.actorUserId,
    action: "iam.role.assigned",
    resourceType: input.scopeType,
    resourceId,
    outcome: "success",
    metadata: {
      roleId: role.id,
      principalType: input.principalType,
      principalId: input.principalId,
    },
  });
}
