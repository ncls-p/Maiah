import { logHandledWarning } from "@/lib/logger";
import { SYSTEM_ROLES } from "@/server/domain/entities/iam";
import { cache } from "@/server/infrastructure/cache";
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

export type Permission = string;
export type PrincipalType = "user" | "group" | "service_account" | "api_key";
export type ResourceType =
  | "organization"
  | "workspace"
  | "agent"
  | "provider"
  | "mcp_server"
  | "knowledge_base"
  | "marketplace_item";

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

async function isActiveWorkspaceMember(userId: string, workspaceId: string) {
  const [workspace] = await db
    .select({ organizationId: workspaces.organizationId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) return false;

  const [organizationMember] = await db
    .select({
      id: organizationMembers.id,
      status: organizationMembers.status,
    })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, workspace.organizationId),
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

async function resolvePermissions(
  ctx: AuthorizationContext,
  resourceType: ResourceType,
  resourceId: string,
): Promise<Permission[]> {
  const cacheKey = `perm:${ctx.principalType}:${ctx.principalId}:${resourceType}:${resourceId}`;
  const cached = await cache.get<Permission[]>(cacheKey);
  if (cached) return cached;

  if (
    resourceType === "workspace" &&
    ctx.principalType === "user" &&
    !(await isActiveWorkspaceMember(ctx.principalId, resourceId))
  ) {
    await cache.set(cacheKey, [], PERMISSION_CACHE_TTL);
    return [];
  }
  if (
    resourceType === "organization" &&
    ctx.principalType === "user" &&
    !(await isActiveOrganizationMember(ctx.principalId, resourceId))
  ) {
    await cache.set(cacheKey, [], PERMISSION_CACHE_TTL);
    return [];
  }

  let organizationId: string | null =
    resourceType === "organization" ? resourceId : null;
  if (resourceType === "workspace") {
    const [workspace] = await db
      .select({ organizationId: workspaces.organizationId })
      .from(workspaces)
      .where(eq(workspaces.id, resourceId))
      .limit(1);
    organizationId = workspace?.organizationId ?? null;
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
  const resourceFilter =
    resourceType === "workspace" && organizationId
      ? or(
          and(
            eq(roleBindings.resourceType, "workspace"),
            eq(roleBindings.resourceId, resourceId),
          ),
          and(
            eq(roleBindings.resourceType, "organization"),
            eq(roleBindings.resourceId, organizationId),
          ),
        )
      : and(
          eq(roleBindings.resourceType, resourceType),
          eq(roleBindings.resourceId, resourceId),
        );

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

export const authorization = {
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
    await cache.del(`perm:user:${principalId}:${resourceType}:${resourceId}`);
  },
};
