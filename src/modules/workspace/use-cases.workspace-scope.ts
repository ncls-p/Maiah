import { logger } from "@/lib/logger";
import { SYSTEM_ROLES } from "@/server/domain/entities/iam";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
  organizationMembers,
  organizations,
  roleBindings,
  roles,
  workspaceMembers,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export const WORKSPACE_SCOPE = "workspace";

export interface CreateWorkspaceInput {
  userId: string;
  organizationName: string;
  organizationSlug: string;
  workspaceName: string;
  workspaceSlug: string;
}

export type WorkspaceRoleName = "workspace.member" | "workspace.admin";

export const PRIMARY_ORGANIZATION_NAME = "Deodis";
export const PRIMARY_ORGANIZATION_SLUG = "deodis";
export const PRIMARY_WORKSPACE_NAME = "Maiah";
export const PRIMARY_WORKSPACE_SLUG = "main";

async function seedSystemRoles(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  createdById: string,
) {
  const seededRoles = new Map<string, typeof roles.$inferSelect>();

  for (const systemRole of SYSTEM_ROLES) {
    const [insertedRole] = await tx
      .insert(roles)
      .values({
        scopeType: systemRole.scopeType,
        ownerResourceType: null,
        ownerResourceId: null,
        name: systemRole.name,
        displayName: systemRole.displayName,
        description: systemRole.description,
        permissionsJson: systemRole.permissions,
        isSystem: true,
        createdById,
      })
      .onConflictDoNothing()
      .returning();

    const role =
      insertedRole ??
      (
        await tx
          .select()
          .from(roles)
          .where(
            and(
              eq(roles.scopeType, systemRole.scopeType),
              eq(roles.name, systemRole.name),
              eq(roles.isSystem, true),
            ),
          )
          .limit(1)
      )[0];

    if (!role) {
      throw new Error(`Failed to seed system role: ${systemRole.name}`);
    }

    seededRoles.set(systemRole.name, role);
  }

  return seededRoles;
}

export async function createWorkspace(input: CreateWorkspaceInput) {
  const {
    userId,
    organizationName,
    organizationSlug,
    workspaceName,
    workspaceSlug,
  } = input;

  const { workspace, organization } = await db.transaction(async (tx) => {
    let [organization] = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.slug, organizationSlug))
      .limit(1);

    const organizationWasCreated = !organization;
    if (organizationWasCreated) {
      [organization] = await tx
        .insert(organizations)
        .values({
          name: organizationName,
          slug: organizationSlug,
        })
        .returning();

      await tx.insert(organizationMembers).values({
        organizationId: organization.id,
        userId,
        status: "active",
      });
    }

    const [workspace] = await tx
      .insert(workspaces)
      .values({
        organizationId: organization.id,
        name: workspaceName,
        slug: workspaceSlug,
        createdById: userId,
      })
      .returning();

    await tx.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId,
      status: "active",
    });

    const seededRoles = await seedSystemRoles(tx, userId);
    const workspaceAdminRole = seededRoles.get("workspace.admin");
    const organizationOwnerRole = seededRoles.get("organization.owner");

    if (!workspaceAdminRole || !organizationOwnerRole) {
      throw new Error("Required system roles are not available");
    }

    await tx.insert(roleBindings).values({
      principalType: "user",
      principalId: userId,
      roleId: workspaceAdminRole.id,
      resourceType: WORKSPACE_SCOPE,
      resourceId: workspace.id,
      createdById: userId,
    });

    if (organizationWasCreated) {
      await tx.insert(roleBindings).values({
        principalType: "user",
        principalId: userId,
        roleId: organizationOwnerRole.id,
        resourceType: "organization",
        resourceId: organization.id,
        createdById: userId,
      });
    }

    return { workspace, organization };
  });

  await audit.emit({
    organizationId: organization.id,
    workspaceId: workspace.id,
    actorPrincipalType: "user",
    actorPrincipalId: userId,
    action: "workspace.created",
    resourceType: WORKSPACE_SCOPE,
    resourceId: workspace.id,
    outcome: "success",
    metadata: { workspaceName, organizationId: organization.id },
  });

  logger.info("Workspace created", { workspaceId: workspace.id, userId });
  return workspace;
}

export async function getWorkspaceBySlug(slug: string) {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.slug, slug), isNull(workspaces.archivedAt)))
    .limit(1);

  return workspace || null;
}
