import { eq } from "drizzle-orm";

import {
type AccessResourceType
} from "@/server/domain/entities/access-resource";
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
import { AssignmentPrincipalType,getWorkspaceScope,IamOperationError,requireDelegablePermissions,requirePermission,rolePermissions } from "./use-cases.iam-operation-error";
import { validateAssignmentPrincipal } from "./use-cases.validate-assignment-principal";


export async function assignResourceRole(input: {
  actorUserId: string;
  workspaceId: string;
  principalType: AssignmentPrincipalType;
  principalId: string;
  roleId: string;
  resourceType: AccessResourceType;
  resourceId: string;
}) {
  const { organization } = await getWorkspaceScope(input.workspaceId);
  const resource = await findAccessResource(
    input.resourceType,
    input.resourceId,
  );
  if (!resource || resource.workspaceId !== input.workspaceId) {
    throw new IamOperationError("Resource not found in this project", 404);
  }

  const [role] = await db
    .select()
    .from(roles)
    .where(eq(roles.id, input.roleId))
    .limit(1);
  if (
    !role ||
    role.scopeType !== "workspace" ||
    (!role.isSystem &&
      !(
        role.ownerResourceType === "workspace" &&
        role.ownerResourceId === input.workspaceId
      ))
  ) {
    throw new IamOperationError(
      "Only a project role can be assigned to a resource",
    );
  }

  await requirePermission({
    userId: input.actorUserId,
    permission: "roles.manage",
    resourceType: "workspace",
    resourceId: input.workspaceId,
    errorMessage: "You do not have permission to share project resources",
  });
  await requireDelegablePermissions({
    actorUserId: input.actorUserId,
    resourceType: "workspace",
    resourceId: input.workspaceId,
    permissions: rolePermissions(role),
  });
  if (
    !(await validateAssignmentPrincipal({
      organizationId: organization.id,
      principalType: input.principalType,
      principalId: input.principalId,
    }))
  ) {
    throw new IamOperationError(
      "The selected member or team is outside this organization",
    );
  }

  await db
    .insert(roleBindings)
    .values({
      principalType: input.principalType,
      principalId: input.principalId,
      roleId: role.id,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      createdById: input.actorUserId,
    })
    .onConflictDoNothing();

  const affectedUserIds =
    input.principalType === "user"
      ? [input.principalId]
      : (
          await db
            .select({ userId: teamMembers.userId })
            .from(teamMembers)
            .where(eq(teamMembers.teamId, input.principalId))
        ).map(({ userId }) => userId);
  await Promise.all(
    affectedUserIds.map((userId) =>
      authorization.invalidatePermissionCache(
        userId,
        input.resourceType,
        input.resourceId,
      ),
    ),
  );
  await audit.emit({
    organizationId: organization.id,
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.actorUserId,
    action: "iam.resource_role.assigned",
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    outcome: "success",
    metadata: {
      roleId: role.id,
      principalType: input.principalType,
      principalId: input.principalId,
    },
  });
}
