import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { findAccessResource } from "@/server/infrastructure/db/access-resource-repository";
import {
  organizationMembers,
  roleBindings,
  roles,
  users,
} from "@/server/infrastructure/db/schema";
import type { AccessResourceType } from "@/server/domain/entities/access-resource";
import { and, asc, eq, inArray } from "drizzle-orm";
import { listResourceShareTargets } from "./resource-sharing";
import {
  getWorkspaceScope,
  IamOperationError,
} from "./use-cases.iam-operation-error";

const SHARE_PERMISSIONS = {
  agent: "agents.update",
  knowledge_base: "knowledgeBases.manage",
  mcp_server: "mcpServers.manage",
} as const satisfies Partial<Record<AccessResourceType, string>>;

export type DirectlyShareableResourceType = keyof typeof SHARE_PERMISSIONS;

async function sharingContext(input: {
  actorUserId: string;
  workspaceId: string;
  resourceType: DirectlyShareableResourceType;
  resourceId: string;
}) {
  const [{ organization }, resource, canManageProject, canManageResource] =
    await Promise.all([
      getWorkspaceScope(input.workspaceId),
      findAccessResource(input.resourceType, input.resourceId),
      authorization.hasPermission(
        { principalType: "user", principalId: input.actorUserId },
        "roles.manage",
        "workspace",
        input.workspaceId,
      ),
      authorization.hasDirectPermission(
        { principalType: "user", principalId: input.actorUserId },
        SHARE_PERMISSIONS[input.resourceType],
        input.resourceType,
        input.resourceId,
        input.workspaceId,
      ),
    ]);
  if (!resource || resource.workspaceId !== input.workspaceId) {
    throw new IamOperationError("Resource not found in this project", 404);
  }
  if (!canManageProject && !canManageResource) {
    throw new IamOperationError("You cannot share this resource", 403);
  }
  return { organization, resource };
}

async function sharingRoles(resourceType: DirectlyShareableResourceType) {
  const roleRows = await db
    .select()
    .from(roles)
    .where(
      and(
        inArray(roles.name, ["workspace.agent_user", "workspace.viewer"]),
        eq(roles.scopeType, "workspace"),
        eq(roles.isSystem, true),
      ),
    );
  const viewerRole = roleRows.find(({ name }) => name === "workspace.viewer");
  const rootRole =
    resourceType === "agent"
      ? roleRows.find(({ name }) => name === "workspace.agent_user")
      : viewerRole;
  if (!rootRole || !viewerRole) {
    throw new IamOperationError(
      "The project roles required for sharing are missing",
      409,
    );
  }
  return { rootRole, viewerRole };
}

export async function getDirectResourceSharing(input: {
  actorUserId: string;
  workspaceId: string;
  resourceType: DirectlyShareableResourceType;
  resourceId: string;
}) {
  const [{ organization }, { rootRole, viewerRole }] = await Promise.all([
    sharingContext(input),
    sharingRoles(input.resourceType),
  ]);
  const [members, bindings] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(organizationMembers)
      .innerJoin(users, eq(organizationMembers.userId, users.id))
      .where(
        and(
          eq(organizationMembers.organizationId, organization.id),
          eq(organizationMembers.status, "active"),
        ),
      )
      .orderBy(asc(users.name), asc(users.email)),
    db
      .select({ userId: roleBindings.principalId })
      .from(roleBindings)
      .where(
        and(
          eq(roleBindings.resourceType, input.resourceType),
          eq(roleBindings.resourceId, input.resourceId),
          eq(roleBindings.principalType, "user"),
          inArray(
            roleBindings.roleId,
            input.resourceType === "agent"
              ? [rootRole.id, viewerRole.id]
              : [rootRole.id],
          ),
        ),
      ),
  ]);
  const candidateMembers = members.filter(({ id }) => id !== input.actorUserId);
  const projectAccess = await Promise.all(
    candidateMembers.map(({ id }) =>
      authorization.hasPermission(
        { principalType: "user", principalId: id },
        "workspaces.get",
        "workspace",
        input.workspaceId,
      ),
    ),
  );
  return {
    members: candidateMembers.filter((_, index) => projectAccess[index]),
    sharedUserIds: bindings.map(({ userId }) => userId),
  };
}

export async function replaceDirectResourceSharing(input: {
  actorUserId: string;
  workspaceId: string;
  resourceType: DirectlyShareableResourceType;
  resourceId: string;
  userIds: string[];
  includeDependencies?: boolean;
}) {
  const userIds = [...new Set(input.userIds)].filter(
    (userId) => userId !== input.actorUserId,
  );
  const [{ organization }, { rootRole, viewerRole }] = await Promise.all([
    sharingContext(input),
    sharingRoles(input.resourceType),
  ]);
  if (userIds.length > 0) {
    const validMembers = await db
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organization.id),
          eq(organizationMembers.status, "active"),
          inArray(organizationMembers.userId, userIds),
        ),
      );
    if (validMembers.length !== userIds.length) {
      throw new IamOperationError(
        "A selected member is outside this organization",
        400,
      );
    }
    const projectAccess = await Promise.all(
      userIds.map((userId) =>
        authorization.hasPermission(
          { principalType: "user", principalId: userId },
          "workspaces.get",
          "workspace",
          input.workspaceId,
        ),
      ),
    );
    if (projectAccess.some((granted) => !granted)) {
      throw new IamOperationError(
        "A selected member does not have access to this project",
        400,
      );
    }
  }

  const previousBindings = await db
    .select({ userId: roleBindings.principalId })
    .from(roleBindings)
    .where(
      and(
        eq(roleBindings.resourceType, input.resourceType),
        eq(roleBindings.resourceId, input.resourceId),
        eq(roleBindings.principalType, "user"),
        inArray(
          roleBindings.roleId,
          input.resourceType === "agent"
            ? [rootRole.id, viewerRole.id]
            : [rootRole.id],
        ),
      ),
    );
  await db
    .delete(roleBindings)
    .where(
      and(
        eq(roleBindings.resourceType, input.resourceType),
        eq(roleBindings.resourceId, input.resourceId),
        eq(roleBindings.principalType, "user"),
        inArray(
          roleBindings.roleId,
          input.resourceType === "agent"
            ? [rootRole.id, viewerRole.id]
            : [rootRole.id],
        ),
      ),
    );

  const targets = await listResourceShareTargets({
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    includeDependencies:
      input.resourceType === "agent" && input.includeDependencies !== false,
  });
  if (userIds.length > 0) {
    await db
      .insert(roleBindings)
      .values(
        userIds.flatMap((userId) =>
          targets.map((target) => ({
            principalType: "user" as const,
            principalId: userId,
            roleId:
              target.type === input.resourceType &&
              target.id === input.resourceId
                ? rootRole.id
                : viewerRole.id,
            resourceType: target.type,
            resourceId: target.id,
            createdById: input.actorUserId,
          })),
        ),
      )
      .onConflictDoNothing();
  }

  const affectedUserIds = [
    ...new Set([...previousBindings.map(({ userId }) => userId), ...userIds]),
  ];
  await Promise.all(
    affectedUserIds.flatMap((userId) =>
      targets.map((target) =>
        authorization.invalidatePermissionCache(userId, target.type, target.id),
      ),
    ),
  );
  await audit.emit({
    organizationId: organization.id,
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.actorUserId,
    action: "iam.resource_direct_sharing.replaced",
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    outcome: "success",
    metadata: {
      userIds,
      includeDependencies:
        input.resourceType === "agent" && input.includeDependencies !== false,
      sharedResourceCount: targets.length,
    },
  });
  return { userIds, resourceCount: targets.length };
}
