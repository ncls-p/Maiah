import { and,count,eq } from "drizzle-orm";

import { audit } from "@/server/domain/services/audit";
import {
authorization
} from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
findAccessResource
} from "@/server/infrastructure/db/access-resource-repository";
import {
roleBindings,
roles,
teamMembers
} from "@/server/infrastructure/db/schema";
import { getWorkspaceScope,IamOperationError,invalidateUserOrganizationAccess,requirePermission } from "./use-cases.iam-operation-error";


export async function removeRoleAssignment(input: {
  actorUserId: string;
  workspaceId: string;
  bindingId: string;
}) {
  const { organization } = await getWorkspaceScope(input.workspaceId);
  const [binding] = await db
    .select({ binding: roleBindings, role: roles })
    .from(roleBindings)
    .innerJoin(roles, eq(roleBindings.roleId, roles.id))
    .where(eq(roleBindings.id, input.bindingId))
    .limit(1);
  const resource =
    binding &&
    binding.binding.resourceType !== "organization" &&
    binding.binding.resourceType !== "workspace"
      ? await findAccessResource(
          binding.binding.resourceType,
          binding.binding.resourceId,
        )
      : null;
  if (
    !binding ||
    !(
      (binding.binding.resourceType === "organization" &&
        binding.binding.resourceId === organization.id) ||
      (binding.binding.resourceType === "workspace" &&
        binding.binding.resourceId === input.workspaceId) ||
      resource?.workspaceId === input.workspaceId
    )
  ) {
    throw new IamOperationError("Access assignment not found", 404);
  }
  await requirePermission({
    userId: input.actorUserId,
    permission: "roles.manage",
    resourceType:
      binding.binding.resourceType === "organization"
        ? "organization"
        : "workspace",
    resourceId:
      binding.binding.resourceType === "organization"
        ? binding.binding.resourceId
        : input.workspaceId,
    errorMessage:
      binding.binding.resourceType === "organization"
        ? "You do not have permission to remove organization access"
        : "You do not have permission to remove project resource access",
  });

  if (binding.role.name === "organization.owner") {
    const [{ value }] = await db
      .select({ value: count() })
      .from(roleBindings)
      .where(
        and(
          eq(roleBindings.roleId, binding.role.id),
          eq(roleBindings.principalType, "user"),
          eq(roleBindings.resourceType, "organization"),
          eq(roleBindings.resourceId, organization.id),
        ),
      );
    if (value <= 1) {
      throw new IamOperationError(
        "Assign another organization owner before removing this access",
        409,
      );
    }
  }

  await db.delete(roleBindings).where(eq(roleBindings.id, input.bindingId));
  const affectedUserIds =
    binding.binding.principalType === "user"
      ? [binding.binding.principalId]
      : binding.binding.principalType === "group"
        ? (
            await db
              .select({ userId: teamMembers.userId })
              .from(teamMembers)
              .where(eq(teamMembers.teamId, binding.binding.principalId))
          ).map(({ userId }) => userId)
        : [];
  await Promise.all(
    affectedUserIds.map((userId) =>
      binding.binding.resourceType === "organization" ||
      binding.binding.resourceType === "workspace"
        ? invalidateUserOrganizationAccess(userId, organization.id)
        : authorization.invalidatePermissionCache(
            userId,
            binding.binding.resourceType,
            binding.binding.resourceId,
          ),
    ),
  );
  await audit.emit({
    organizationId: organization.id,
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.actorUserId,
    action: "iam.role.unassigned",
    resourceType: binding.binding.resourceType,
    resourceId: binding.binding.resourceId,
    outcome: "success",
    metadata: {
      bindingId: binding.binding.id,
      roleId: binding.role.id,
      principalType: binding.binding.principalType,
      principalId: binding.binding.principalId,
    },
  });
}
