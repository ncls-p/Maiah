import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";

import { ACCESS_RESOURCE_TYPES } from "@/server/domain/entities/access-resource";
import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { listAccessResources } from "@/server/infrastructure/db/access-resource-repository";
import {
  organizationMembers,
  organizations,
  roleBindings,
  roles,
  teams,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { getWorkspacesByUserId } from "@/modules/workspace/use-cases";

import { IamOperationError } from "./use-cases";

function normalizedSlug(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128);
}

async function scopeForWorkspace(workspaceId: string) {
  const [scope] = await db
    .select({ workspace: workspaces, organization: organizations })
    .from(workspaces)
    .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
    .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.archivedAt)))
    .limit(1);
  if (!scope) throw new IamOperationError("Project not found", 404);
  return scope;
}

async function requirePermission(input: {
  actorUserId: string;
  permission: "organization.update" | "workspaces.update";
  resourceType: "organization" | "workspace";
  resourceId: string;
}) {
  const allowed = await authorization.hasPermission(
    { principalType: "user", principalId: input.actorUserId },
    input.permission,
    input.resourceType,
    input.resourceId,
  );
  if (!allowed) {
    throw new IamOperationError(
      "You do not have permission to manage this scope",
      403,
    );
  }
}

async function listAllResourceIds(workspaceIds: string[]) {
  const ids: string[] = [];
  for (const workspaceId of workspaceIds) {
    for (const type of ACCESS_RESOURCE_TYPES) {
      let offset = 0;
      while (true) {
        const page = await listAccessResources({
          workspaceId,
          type,
          offset,
          limit: 100,
        });
        ids.push(...page.resources.map(({ id }) => id));
        if (!page.hasMore) break;
        offset = page.nextOffset ?? offset + page.resources.length;
      }
    }
  }
  return ids;
}

async function nextWorkspaceOutsideOrganization(
  actorUserId: string,
  organizationId: string,
) {
  const candidates = await getWorkspacesByUserId(actorUserId);
  return (
    candidates.find(
      ({ workspace }) => workspace.organizationId !== organizationId,
    )?.workspace.id ?? null
  );
}

async function invalidateOrganizationMembers(organizationId: string) {
  const members = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, organizationId));
  await Promise.all(
    members.map(({ userId }) =>
      authorization.invalidatePrincipalPermissionCache(userId),
    ),
  );
}

export async function renameProject(input: {
  actorUserId: string;
  workspaceId: string;
  name: string;
  slug?: string;
}) {
  const { workspace, organization } = await scopeForWorkspace(
    input.workspaceId,
  );
  await requirePermission({
    actorUserId: input.actorUserId,
    permission: "workspaces.update",
    resourceType: "workspace",
    resourceId: workspace.id,
  });
  const slug = normalizedSlug(input.slug ?? input.name);
  if (!slug) throw new IamOperationError("Enter a valid project URL", 400);
  const [conflict] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.organizationId, organization.id),
        eq(workspaces.slug, slug),
        ne(workspaces.id, workspace.id),
        isNull(workspaces.archivedAt),
      ),
    )
    .limit(1);
  if (conflict) {
    throw new IamOperationError(
      "A project with this URL already exists in the organization",
      409,
    );
  }
  const [updated] = await db
    .update(workspaces)
    .set({ name: input.name.trim(), slug, updatedAt: new Date() })
    .where(eq(workspaces.id, workspace.id))
    .returning();
  await audit.emit({
    organizationId: organization.id,
    workspaceId: workspace.id,
    actorPrincipalType: "user",
    actorPrincipalId: input.actorUserId,
    action: "workspace.updated",
    resourceType: "workspace",
    resourceId: workspace.id,
    outcome: "success",
    metadata: {
      previousName: workspace.name,
      previousSlug: workspace.slug,
      name: updated.name,
      slug: updated.slug,
    },
  });
  return updated;
}

export async function renameOrganization(input: {
  actorUserId: string;
  workspaceId: string;
  name: string;
  slug?: string;
}) {
  const { workspace, organization } = await scopeForWorkspace(
    input.workspaceId,
  );
  await requirePermission({
    actorUserId: input.actorUserId,
    permission: "organization.update",
    resourceType: "organization",
    resourceId: organization.id,
  });
  const slug = normalizedSlug(input.slug ?? input.name);
  if (!slug) throw new IamOperationError("Enter a valid organization URL", 400);
  const [conflict] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(eq(organizations.slug, slug), ne(organizations.id, organization.id)),
    )
    .limit(1);
  if (conflict) {
    throw new IamOperationError("This organization URL is already in use", 409);
  }
  const [updated] = await db
    .update(organizations)
    .set({ name: input.name.trim(), slug, updatedAt: new Date() })
    .where(eq(organizations.id, organization.id))
    .returning();
  await audit.emit({
    organizationId: organization.id,
    workspaceId: workspace.id,
    actorPrincipalType: "user",
    actorPrincipalId: input.actorUserId,
    action: "organization.updated",
    resourceType: "organization",
    resourceId: organization.id,
    outcome: "success",
    metadata: {
      previousName: organization.name,
      previousSlug: organization.slug,
      name: updated.name,
      slug: updated.slug,
    },
  });
  return updated;
}

export async function deleteProject(input: {
  actorUserId: string;
  workspaceId: string;
  confirmationName: string;
}) {
  const { workspace, organization } = await scopeForWorkspace(
    input.workspaceId,
  );
  await requirePermission({
    actorUserId: input.actorUserId,
    permission: "workspaces.update",
    resourceType: "workspace",
    resourceId: workspace.id,
  });
  if (input.confirmationName.trim() !== workspace.name) {
    throw new IamOperationError("Type the exact project name to confirm", 400);
  }
  const activeProjects = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.organizationId, organization.id),
        isNull(workspaces.archivedAt),
      ),
    );
  if (activeProjects.length === 1) {
    throw new IamOperationError(
      "This is the organization’s last project. Delete the organization instead.",
      409,
    );
  }
  const [resourceIds, customRoles] = await Promise.all([
    listAllResourceIds([workspace.id]),
    db
      .select({ id: roles.id })
      .from(roles)
      .where(
        and(
          eq(roles.isSystem, false),
          eq(roles.ownerResourceType, "workspace"),
          eq(roles.ownerResourceId, workspace.id),
        ),
      ),
  ]);
  const customRoleIds = customRoles.map(({ id }) => id);
  await db.transaction(async (tx) => {
    if (customRoleIds.length > 0) {
      await tx
        .delete(roleBindings)
        .where(inArray(roleBindings.roleId, customRoleIds));
      await tx.delete(roles).where(inArray(roles.id, customRoleIds));
    }
    const boundResourceIds = [workspace.id, ...resourceIds];
    if (boundResourceIds.length > 0) {
      await tx
        .delete(roleBindings)
        .where(inArray(roleBindings.resourceId, boundResourceIds));
    }
    await tx.delete(workspaces).where(eq(workspaces.id, workspace.id));
  });
  await invalidateOrganizationMembers(organization.id);
  await audit.emit({
    organizationId: organization.id,
    actorPrincipalType: "user",
    actorPrincipalId: input.actorUserId,
    action: "workspace.deleted",
    resourceType: "workspace",
    resourceId: workspace.id,
    outcome: "success",
    metadata: { name: workspace.name, slug: workspace.slug },
  });
  return {
    nextWorkspaceId:
      activeProjects.find(({ id }) => id !== workspace.id)?.id ?? null,
  };
}

export async function deleteOrganization(input: {
  actorUserId: string;
  workspaceId: string;
  confirmationName: string;
}) {
  const { organization } = await scopeForWorkspace(input.workspaceId);
  await requirePermission({
    actorUserId: input.actorUserId,
    permission: "organization.update",
    resourceType: "organization",
    resourceId: organization.id,
  });
  if (input.confirmationName.trim() !== organization.name) {
    throw new IamOperationError(
      "Type the exact organization name to confirm",
      400,
    );
  }
  const [projectRows, memberRows, teamRows, nextWorkspaceId] =
    await Promise.all([
      db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.organizationId, organization.id)),
      db
        .select({ userId: organizationMembers.userId })
        .from(organizationMembers)
        .where(eq(organizationMembers.organizationId, organization.id)),
      db
        .select({ id: teams.id })
        .from(teams)
        .where(eq(teams.organizationId, organization.id)),
      nextWorkspaceOutsideOrganization(input.actorUserId, organization.id),
    ]);
  const workspaceIds = projectRows.map(({ id }) => id);
  const [resourceIds, customRoles] = await Promise.all([
    listAllResourceIds(workspaceIds),
    db
      .select({ id: roles.id })
      .from(roles)
      .where(
        and(
          eq(roles.isSystem, false),
          or(
            and(
              eq(roles.ownerResourceType, "organization"),
              eq(roles.ownerResourceId, organization.id),
            ),
            workspaceIds.length > 0
              ? and(
                  eq(roles.ownerResourceType, "workspace"),
                  inArray(roles.ownerResourceId, workspaceIds),
                )
              : undefined,
          ),
        ),
      ),
  ]);
  const customRoleIds = customRoles.map(({ id }) => id);
  const teamIds = teamRows.map(({ id }) => id);
  await db.transaction(async (tx) => {
    if (teamIds.length > 0) {
      await tx
        .delete(roleBindings)
        .where(
          and(
            eq(roleBindings.principalType, "group"),
            inArray(roleBindings.principalId, teamIds),
          ),
        );
    }
    if (customRoleIds.length > 0) {
      await tx
        .delete(roleBindings)
        .where(inArray(roleBindings.roleId, customRoleIds));
      await tx.delete(roles).where(inArray(roles.id, customRoleIds));
    }
    const boundResourceIds = [organization.id, ...workspaceIds, ...resourceIds];
    await tx
      .delete(roleBindings)
      .where(inArray(roleBindings.resourceId, boundResourceIds));
    await tx.delete(organizations).where(eq(organizations.id, organization.id));
  });
  await Promise.all(
    memberRows.map(({ userId }) =>
      authorization.invalidatePrincipalPermissionCache(userId),
    ),
  );
  await audit.emit({
    organizationId: organization.id,
    actorPrincipalType: "user",
    actorPrincipalId: input.actorUserId,
    action: "organization.deleted",
    resourceType: "organization",
    resourceId: organization.id,
    outcome: "success",
    metadata: {
      name: organization.name,
      slug: organization.slug,
      projects: workspaceIds.length,
    },
  });
  return { nextWorkspaceId };
}
