import { and,count,eq,inArray,ne } from "drizzle-orm";

import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
roleBindings,
roles,
teamMembers
} from "@/server/infrastructure/db/schema";
import {
isKnownPermission,
isPermissionCompatibleWithScope
} from "./permission-catalog";
import { customRoleName,getWorkspaceScope,IamOperationError,invalidateUserOrganizationAccess,requireDelegablePermissions,requirePermission,rolePermissions,ScopeType } from "./use-cases.iam-operation-error";


export async function updateCustomRole(input: {
  actorUserId: string;
  workspaceId: string;
  roleId: string;
  displayName: string;
  description?: string;
  permissions: string[];
}) {
  const { organization } = await getWorkspaceScope(input.workspaceId);
  const [role] = await db
    .select()
    .from(roles)
    .where(eq(roles.id, input.roleId))
    .limit(1);
  if (
    !role ||
    role.isSystem ||
    !(
      (role.scopeType === "organization" &&
        role.ownerResourceType === "organization" &&
        role.ownerResourceId === organization.id) ||
      (role.scopeType === "workspace" &&
        role.ownerResourceType === "workspace" &&
        role.ownerResourceId === input.workspaceId)
    )
  ) {
    throw new IamOperationError("Custom role not found", 404);
  }
  const scopeType = role.scopeType as ScopeType;
  await requirePermission({
    userId: input.actorUserId,
    permission: "roles.manage",
    resourceType: scopeType,
    resourceId:
      scopeType === "organization" ? organization.id : input.workspaceId,
    errorMessage: "You do not have permission to update this role",
  });
  const permissions = [...new Set(input.permissions)];
  if (permissions.length === 0) {
    throw new IamOperationError("Select at least one permission");
  }
  if (permissions.some((permission) => !isKnownPermission(permission))) {
    throw new IamOperationError("The role contains an unsupported permission");
  }
  if (
    permissions.some(
      (permission) => !isPermissionCompatibleWithScope(permission, scopeType),
    )
  ) {
    throw new IamOperationError(
      "One or more permissions cannot be used in a project role",
    );
  }
  await requireDelegablePermissions({
    actorUserId: input.actorUserId,
    resourceType: scopeType,
    resourceId:
      scopeType === "organization" ? organization.id : input.workspaceId,
    permissions,
  });

  const name = customRoleName(input.displayName);
  const [existingRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(
      and(
        eq(roles.ownerResourceType, role.ownerResourceType),
        eq(roles.ownerResourceId, role.ownerResourceId),
        eq(roles.name, name),
        ne(roles.id, role.id),
      ),
    )
    .limit(1);
  if (existingRole) {
    throw new IamOperationError(
      "A custom role with this name already exists",
      409,
    );
  }

  const bindings = await db
    .select({
      principalType: roleBindings.principalType,
      principalId: roleBindings.principalId,
    })
    .from(roleBindings)
    .where(eq(roleBindings.roleId, role.id));
  const directUserIds = bindings
    .filter(({ principalType }) => principalType === "user")
    .map(({ principalId }) => principalId);
  const teamIds = bindings
    .filter(({ principalType }) => principalType === "group")
    .map(({ principalId }) => principalId);
  const teamUserIds =
    teamIds.length === 0
      ? []
      : (
          await db
            .select({ userId: teamMembers.userId })
            .from(teamMembers)
            .where(inArray(teamMembers.teamId, teamIds))
        ).map(({ userId }) => userId);

  const [updated] = await db
    .update(roles)
    .set({
      name,
      displayName: input.displayName.trim(),
      description: input.description?.trim() || null,
      permissionsJson: permissions,
      updatedAt: new Date(),
    })
    .where(eq(roles.id, role.id))
    .returning();

  await Promise.all(
    [...new Set([...directUserIds, ...teamUserIds])].map((userId) =>
      invalidateUserOrganizationAccess(userId, organization.id),
    ),
  );
  await audit.emit({
    organizationId: organization.id,
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.actorUserId,
    action: "iam.role.updated",
    resourceType: scopeType,
    resourceId:
      scopeType === "organization" ? organization.id : input.workspaceId,
    outcome: "success",
    metadata: {
      roleId: role.id,
      scopeType,
      permissionCount: permissions.length,
    },
  });
  return updated;
}

export async function deleteCustomRole(input: {
  actorUserId: string;
  workspaceId: string;
  roleId: string;
}) {
  const { organization } = await getWorkspaceScope(input.workspaceId);
  const [role] = await db
    .select()
    .from(roles)
    .where(eq(roles.id, input.roleId))
    .limit(1);
  if (
    !role ||
    role.isSystem ||
    !(
      (role.scopeType === "organization" &&
        role.ownerResourceType === "organization" &&
        role.ownerResourceId === organization.id) ||
      (role.scopeType === "workspace" &&
        role.ownerResourceType === "workspace" &&
        role.ownerResourceId === input.workspaceId)
    )
  ) {
    throw new IamOperationError("Custom role not found", 404);
  }

  await requirePermission({
    userId: input.actorUserId,
    permission: "roles.manage",
    resourceType: role.scopeType as ScopeType,
    resourceId:
      role.scopeType === "organization" ? organization.id : input.workspaceId,
    errorMessage: "You do not have permission to delete this role",
  });
  await requireDelegablePermissions({
    actorUserId: input.actorUserId,
    resourceType: role.scopeType as ScopeType,
    resourceId:
      role.scopeType === "organization" ? organization.id : input.workspaceId,
    permissions: rolePermissions(role),
  });
  const [{ value: assignmentCount }] = await db
    .select({ value: count() })
    .from(roleBindings)
    .where(eq(roleBindings.roleId, role.id));
  if (assignmentCount > 0) {
    throw new IamOperationError(
      "Remove this role from all members and teams before deleting it",
      409,
    );
  }

  await db.delete(roles).where(eq(roles.id, role.id));
  await audit.emit({
    organizationId: organization.id,
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.actorUserId,
    action: "iam.role.deleted",
    resourceType: role.scopeType,
    resourceId:
      role.scopeType === "organization" ? organization.id : input.workspaceId,
    outcome: "success",
    metadata: { roleId: role.id, roleName: role.name },
  });
}
