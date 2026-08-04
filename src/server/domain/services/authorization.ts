import { logHandledWarning } from "@/lib/logger";
import type { AccessResourceType } from "@/server/domain/entities/access-resource";
import { SYSTEM_ROLES } from "@/server/domain/entities/iam";
import { cache } from "@/server/infrastructure/cache";
import { findAccessResource } from "@/server/infrastructure/db/access-resource-repository";
import { db } from "@/server/infrastructure/db";
import {
  organizationMembers,
  roles,
  roleBindings,
  teamMembers,
  teams,
  workspaceMembers,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { and, eq, gte, inArray, isNull, or } from "drizzle-orm";

const PERMISSION_CACHE_TTL = 60; // 60 seconds
const globalAuthorization = globalThis as typeof globalThis & {
  __maiahPermissionResolutions?: Map<string, Promise<Permission[]>>;
};
const permissionResolutions =
  (globalAuthorization.__maiahPermissionResolutions ??= new Map());

export type Permission = string;
export type PrincipalType = "user" | "group" | "service_account" | "api_key";
export type ResourceType = "organization" | "workspace" | AccessResourceType;

export interface AuthorizationContext {
  principalType: PrincipalType;
  principalId: string;
}

export interface PermissionCheckResult {
  granted: boolean;
  reason?: string;
}

const SYSTEM_ROLE_PERMISSIONS = new Map(
  SYSTEM_ROLES.map((role) => [role.name, role.permissions]),
);

const VIEW_ACTIONS = new Set([
  "get",
  "list",
  "view",
  "viewAllowed",
  "viewLimited",
  "viewMetadata",
  "viewOwn",
  "viewShared",
]);

function parsePermission(perm: string): { domain: string; action: string } {
  const [domain, action = "*"] = perm.split(".");
  return { domain, action };
}

export function matchesPermission(
  grantedPermission: string,
  requiredPermission: string,
): boolean {
  const { domain: grantedDomain, action: grantedAction } =
    parsePermission(grantedPermission);
  const { domain: requiredDomain, action: requiredAction } =
    parsePermission(requiredPermission);

  if (grantedDomain !== requiredDomain) return false;
  if (grantedAction === "*" || grantedAction === "manage") return true;
  if (grantedAction === "view" && VIEW_ACTIONS.has(requiredAction)) return true;
  return grantedAction === requiredAction;
}

export function canDelegatePermissionSet(
  actorPermissions: readonly Permission[],
  delegatedPermissions: readonly Permission[],
): boolean {
  return delegatedPermissions.every((permission) =>
    actorPermissions.some((granted) => matchesPermission(granted, permission)),
  );
}

async function isActiveWorkspaceMember(
  userId: string,
  workspaceId: string,
  knownOrganizationId?: string,
) {
  let organizationId = knownOrganizationId;
  if (!organizationId) {
    const [workspace] = await db
      .select({ organizationId: workspaces.organizationId })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    if (!workspace) return false;
    organizationId = workspace.organizationId;
  }

  const [organizationMember] = await db
    .select({
      id: organizationMembers.id,
      status: organizationMembers.status,
    })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId),
      ),
    )
    .limit(1);

  if (organizationMember) {
    return organizationMember.status === "active";
  }

  const [workspaceMember] = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.status, "active"),
      ),
    )
    .limit(1);

  return Boolean(workspaceMember);
}

async function isActiveOrganizationMember(
  userId: string,
  organizationId: string,
) {
  const [member] = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.status, "active"),
      ),
    )
    .limit(1);

  return Boolean(member);
}

function addRolePermissions(
  permissions: Permission[],
  role: { name: string; permissionsJson: unknown },
) {
  const dbPermissions = Array.isArray(role.permissionsJson)
    ? (role.permissionsJson as Permission[])
    : [];
  permissions.push(...dbPermissions);

  const currentSystemPermissions = SYSTEM_ROLE_PERMISSIONS.get(role.name);
  if (currentSystemPermissions) {
    permissions.push(...currentSystemPermissions);
  }
}

function uniquePermissions(permissions: Permission[]) {
  return [...new Set(permissions)];
}

async function resolvePermissionsUncached(
  ctx: AuthorizationContext,
  resourceType: ResourceType,
  resourceId: string,
  cacheKey: string,
): Promise<Permission[]> {
  let organizationId: string | null =
    resourceType === "organization" ? resourceId : null;
  let workspaceId: string | null =
    resourceType === "workspace" ? resourceId : null;
  let parentResource: { type: AccessResourceType; id: string } | undefined;
  if (resourceType === "workspace") {
    const [workspace] = await db
      .select({ organizationId: workspaces.organizationId })
      .from(workspaces)
      .where(eq(workspaces.id, resourceId))
      .limit(1);
    if (!workspace) {
      await cache.set(cacheKey, [], PERMISSION_CACHE_TTL);
      return [];
    }
    organizationId = workspace.organizationId;
  } else if (resourceType !== "organization") {
    const resource = await findAccessResource(resourceType, resourceId);
    if (!resource) {
      await cache.set(cacheKey, [], PERMISSION_CACHE_TTL);
      return [];
    }
    workspaceId = resource.workspaceId;
    organizationId = resource.organizationId;
    parentResource = resource.parent;
  }

  if (
    ctx.principalType === "user" &&
    ((workspaceId &&
      !(await isActiveWorkspaceMember(
        ctx.principalId,
        workspaceId,
        organizationId ?? undefined,
      ))) ||
      (!workspaceId &&
        organizationId &&
        !(await isActiveOrganizationMember(ctx.principalId, organizationId))))
  ) {
    await cache.set(cacheKey, [], PERMISSION_CACHE_TTL);
    return [];
  }

  let teamIds: string[] = [];
  if (ctx.principalType === "user" && organizationId) {
    const memberships = await db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(
        and(
          eq(teamMembers.userId, ctx.principalId),
          eq(teams.organizationId, organizationId),
        ),
      );
    teamIds = memberships.map(({ teamId }) => teamId);
  }

  const principalFilter =
    ctx.principalType === "user" && teamIds.length > 0
      ? or(
          and(
            eq(roleBindings.principalType, "user"),
            eq(roleBindings.principalId, ctx.principalId),
          ),
          and(
            eq(roleBindings.principalType, "group"),
            inArray(roleBindings.principalId, teamIds),
          ),
        )
      : and(
          eq(roleBindings.principalType, ctx.principalType),
          eq(roleBindings.principalId, ctx.principalId),
        );
  const inheritedResourceFilters = [
    and(
      eq(roleBindings.resourceType, resourceType),
      eq(roleBindings.resourceId, resourceId),
    ),
  ];
  if (workspaceId && resourceType !== "workspace") {
    inheritedResourceFilters.push(
      and(
        eq(roleBindings.resourceType, "workspace"),
        eq(roleBindings.resourceId, workspaceId),
      ),
    );
  }
  if (parentResource) {
    inheritedResourceFilters.push(
      and(
        eq(roleBindings.resourceType, parentResource.type),
        eq(roleBindings.resourceId, parentResource.id),
      ),
    );
  }
  if (organizationId && resourceType !== "organization") {
    inheritedResourceFilters.push(
      and(
        eq(roleBindings.resourceType, "organization"),
        eq(roleBindings.resourceId, organizationId),
      ),
    );
  }
  const resourceFilter =
    inheritedResourceFilters.length === 1
      ? inheritedResourceFilters[0]
      : or(...inheritedResourceFilters);

  const bindings = await db
    .select()
    .from(roleBindings)
    .innerJoin(roles, eq(roleBindings.roleId, roles.id))
    .where(
      and(
        principalFilter,
        resourceFilter,
        or(
          isNull(roleBindings.expiresAt),
          gte(roleBindings.expiresAt, new Date()),
        ),
      ),
    );

  const permissions: Permission[] = [];
  for (const binding of bindings) {
    addRolePermissions(permissions, binding.roles);
  }

  const resolvedPermissions = uniquePermissions(permissions);
  await cache.set(cacheKey, resolvedPermissions, PERMISSION_CACHE_TTL);
  return resolvedPermissions;
}

async function resolvePermissions(
  ctx: AuthorizationContext,
  resourceType: ResourceType,
  resourceId: string,
): Promise<Permission[]> {
  const cacheKey = `perm:${ctx.principalType}:${ctx.principalId}:${resourceType}:${resourceId}`;
  const cached = await cache.get<Permission[]>(cacheKey);
  if (cached) return cached;

  const pending = permissionResolutions.get(cacheKey);
  if (pending) return pending;

  const resolution = resolvePermissionsUncached(
    ctx,
    resourceType,
    resourceId,
    cacheKey,
  );
  permissionResolutions.set(cacheKey, resolution);
  try {
    return await resolution;
  } finally {
    if (permissionResolutions.get(cacheKey) === resolution) {
      permissionResolutions.delete(cacheKey);
    }
  }
}

export const authorization = {
  async listDirectlyAuthorizedResourceIds(
    ctx: AuthorizationContext,
    permission: string,
    resourceType: AccessResourceType,
    resourceIds: string[],
    workspaceId?: string,
  ): Promise<Set<string>> {
    const uniqueResourceIds = [...new Set(resourceIds)];
    if (uniqueResourceIds.length === 0) return new Set();

    let teamIds: string[] = [];
    if (ctx.principalType === "user") {
      const resolvedWorkspaceId =
        workspaceId ??
        (await findAccessResource(resourceType, uniqueResourceIds[0]))
          ?.workspaceId;
      if (
        !resolvedWorkspaceId ||
        !(await isActiveWorkspaceMember(ctx.principalId, resolvedWorkspaceId))
      ) {
        return new Set();
      }
      const memberships = await db
        .select({ teamId: teamMembers.teamId })
        .from(teamMembers)
        .where(eq(teamMembers.userId, ctx.principalId));
      teamIds = memberships.map(({ teamId }) => teamId);
    }

    const principalFilter =
      ctx.principalType === "user" && teamIds.length > 0
        ? or(
            and(
              eq(roleBindings.principalType, "user"),
              eq(roleBindings.principalId, ctx.principalId),
            ),
            and(
              eq(roleBindings.principalType, "group"),
              inArray(roleBindings.principalId, teamIds),
            ),
          )
        : and(
            eq(roleBindings.principalType, ctx.principalType),
            eq(roleBindings.principalId, ctx.principalId),
          );
    const bindings = await db
      .select({
        resourceId: roleBindings.resourceId,
        roleName: roles.name,
        permissionsJson: roles.permissionsJson,
      })
      .from(roleBindings)
      .innerJoin(roles, eq(roleBindings.roleId, roles.id))
      .where(
        and(
          principalFilter,
          eq(roleBindings.resourceType, resourceType),
          inArray(roleBindings.resourceId, uniqueResourceIds),
          or(
            isNull(roleBindings.expiresAt),
            gte(roleBindings.expiresAt, new Date()),
          ),
        ),
      );

    return new Set(
      bindings
        .filter((binding) => {
          const permissions: Permission[] = [];
          addRolePermissions(permissions, {
            name: binding.roleName,
            permissionsJson: binding.permissionsJson,
          });
          return permissions.some((granted) =>
            matchesPermission(granted, permission),
          );
        })
        .map(({ resourceId }) => resourceId),
    );
  },

  async hasDirectPermission(
    ctx: AuthorizationContext,
    permission: string,
    resourceType: AccessResourceType,
    resourceId: string,
    workspaceId?: string,
  ): Promise<boolean> {
    return (
      await this.listDirectlyAuthorizedResourceIds(
        ctx,
        permission,
        resourceType,
        [resourceId],
        workspaceId,
      )
    ).has(resourceId);
  },

  async listPermissions(
    ctx: AuthorizationContext,
    resourceType: ResourceType,
    resourceId: string,
  ): Promise<Permission[]> {
    return resolvePermissions(ctx, resourceType, resourceId);
  },

  async checkPermission(
    ctx: AuthorizationContext,
    permission: string,
    resourceType: ResourceType,
    resourceId: string,
  ): Promise<PermissionCheckResult> {
    const permissions = await resolvePermissions(ctx, resourceType, resourceId);
    const granted = permissions.some((p) => matchesPermission(p, permission));

    return {
      granted,
      reason: granted ? undefined : `Missing permission: ${permission}`,
    };
  },

  async requirePermission(
    ctx: AuthorizationContext,
    permission: string,
    resourceType: ResourceType,
    resourceId: string,
  ): Promise<PermissionCheckResult> {
    const result = await this.checkPermission(
      ctx,
      permission,
      resourceType,
      resourceId,
    );

    if (!result.granted) {
      logHandledWarning("Permission denied", {
        principal: ctx.principalId,
        permission,
        resourceType,
        resourceId,
      });
    }

    return result;
  },

  async hasPermission(
    ctx: AuthorizationContext,
    permission: string,
    resourceType: ResourceType,
    resourceId: string,
  ): Promise<boolean> {
    const result = await this.checkPermission(
      ctx,
      permission,
      resourceType,
      resourceId,
    );
    return result.granted;
  },

  async requireWorkspaceMember(
    userId: string,
    workspaceId: string,
  ): Promise<boolean> {
    const isMember = await isActiveWorkspaceMember(userId, workspaceId);
    return isMember;
  },

  async invalidatePermissionCache(
    principalId: string,
    resourceType: ResourceType,
    resourceId: string,
  ): Promise<void> {
    permissionResolutions.delete(
      `perm:user:${principalId}:${resourceType}:${resourceId}`,
    );
    await cache.del(`perm:user:${principalId}:${resourceType}:${resourceId}`);
  },

  async invalidatePrincipalPermissionCache(principalId: string): Promise<void> {
    const prefix = `perm:user:${principalId}:`;
    for (const key of permissionResolutions.keys()) {
      if (key.startsWith(prefix)) permissionResolutions.delete(key);
    }
    await cache.delByPrefix(`perm:user:${principalId}:`);
  },
};
