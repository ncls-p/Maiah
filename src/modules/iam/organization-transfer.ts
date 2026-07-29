import { createHash, randomUUID } from "node:crypto";

import { and, count, eq, inArray, isNull } from "drizzle-orm";

import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  aiProviders,
  agentSkills,
  conversations,
  customTools,
  knowledgeBases,
  mcpServers,
  organizationBuiltinToolPolicies,
  organizationMembers,
  organizations,
  roleBindings,
  roles,
  scheduledTasks,
  teamMembers,
  teams,
  toolConnections,
  workflows,
  workspaceMembers,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { getWorkspacesByUserId } from "@/modules/workspace/use-cases";

import { IamOperationError } from "./use-cases";
import { cloneWorkspaceConfiguration } from "./workspace-clone";

export type OrganizationTransferDestination = {
  organizationId: string;
  organizationName: string;
  workspaceId: string;
  workspaceName: string;
};

export type OrganizationTransferPreview = {
  source: {
    organizationId: string;
    organizationName: string;
  };
  destination: OrganizationTransferDestination;
  counts: {
    projects: number;
    members: number;
    teams: number;
    roles: number;
    resources: number;
  };
  blockers: string[];
  warnings: string[];
  confirmationToken: string;
};

async function scopeForWorkspace(workspaceId: string) {
  const [scope] = await db
    .select({
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      organizationId: organizations.id,
      organizationName: organizations.name,
    })
    .from(workspaces)
    .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
    .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.archivedAt)))
    .limit(1);
  if (!scope) throw new IamOperationError("Project not found", 404);
  return scope;
}

async function hasPermission(
  userId: string,
  permission: string,
  resourceType: "organization" | "workspace",
  resourceId: string,
) {
  return (
    await authorization.checkPermission(
      { principalType: "user", principalId: userId },
      permission,
      resourceType,
      resourceId,
    )
  ).granted;
}

async function requireOrganizationTransferPermissions(input: {
  actorUserId: string;
  sourceWorkspaceId: string;
  sourceOrganizationId: string;
  targetWorkspaceId: string;
  targetOrganizationId: string;
}) {
  const checks = await Promise.all([
    hasPermission(
      input.actorUserId,
      "roles.manage",
      "workspace",
      input.sourceWorkspaceId,
    ),
    hasPermission(
      input.actorUserId,
      "members.manage",
      "organization",
      input.sourceOrganizationId,
    ),
    hasPermission(
      input.actorUserId,
      "roles.manage",
      "workspace",
      input.targetWorkspaceId,
    ),
    hasPermission(
      input.actorUserId,
      "members.manage",
      "organization",
      input.targetOrganizationId,
    ),
  ]);
  if (checks.some((allowed) => !allowed)) {
    throw new IamOperationError(
      "You need organization and project access administration rights on both sides",
      403,
    );
  }
}

export async function listOrganizationTransferDestinations(input: {
  actorUserId: string;
  sourceWorkspaceId: string;
}) {
  const source = await scopeForWorkspace(input.sourceWorkspaceId);
  const candidates = await getWorkspacesByUserId(input.actorUserId);
  const byOrganization = new Map<string, OrganizationTransferDestination>();
  for (const { workspace, organization } of candidates) {
    if (
      organization.id === source.organizationId ||
      byOrganization.has(organization.id)
    ) {
      continue;
    }
    const allowed = await Promise.all([
      hasPermission(
        input.actorUserId,
        "roles.manage",
        "workspace",
        workspace.id,
      ),
      hasPermission(
        input.actorUserId,
        "members.manage",
        "organization",
        organization.id,
      ),
    ]);
    if (allowed.every(Boolean)) {
      byOrganization.set(organization.id, {
        organizationId: organization.id,
        organizationName: organization.name,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
      });
    }
  }
  return [...byOrganization.values()].sort((a, b) =>
    a.organizationName.localeCompare(b.organizationName),
  );
}

function transferFingerprint(input: {
  sourceOrganizationId: string;
  targetOrganizationId: string;
  counts: OrganizationTransferPreview["counts"];
  blockers: string[];
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        sourceOrganizationId: input.sourceOrganizationId,
        targetOrganizationId: input.targetOrganizationId,
        counts: input.counts,
        blockers: [...input.blockers].sort(),
      }),
    )
    .digest("hex");
}

async function resourceCount(workspaceIds: string[]) {
  if (workspaceIds.length === 0) return 0;
  const tables = [
    agents,
    aiProviders,
    mcpServers,
    toolConnections,
    customTools,
    knowledgeBases,
    agentSkills,
    workflows,
    scheduledTasks,
    conversations,
  ] as const;
  const counts = await Promise.all(
    tables.map((table) =>
      db
        .select({ value: count() })
        .from(table)
        .where(inArray(table.workspaceId, workspaceIds))
        .then((rows) => Number(rows[0]?.value ?? 0)),
    ),
  );
  return counts.reduce((total, value) => total + value, 0);
}

export async function previewOrganizationTransfer(input: {
  actorUserId: string;
  sourceWorkspaceId: string;
  targetOrganizationId: string;
}): Promise<OrganizationTransferPreview> {
  const source = await scopeForWorkspace(input.sourceWorkspaceId);
  if (source.organizationId === input.targetOrganizationId) {
    throw new IamOperationError("Choose another organization", 400);
  }
  const [destination] = (
    await listOrganizationTransferDestinations({
      actorUserId: input.actorUserId,
      sourceWorkspaceId: input.sourceWorkspaceId,
    })
  ).filter(
    ({ organizationId }) => organizationId === input.targetOrganizationId,
  );
  if (!destination) {
    throw new IamOperationError("Destination organization is unavailable", 403);
  }
  await requireOrganizationTransferPermissions({
    actorUserId: input.actorUserId,
    sourceWorkspaceId: input.sourceWorkspaceId,
    sourceOrganizationId: source.organizationId,
    targetWorkspaceId: destination.workspaceId,
    targetOrganizationId: destination.organizationId,
  });

  const [sourceProjects, targetProjects, sourceTeams, targetTeams] =
    await Promise.all([
      db
        .select({ id: workspaces.id, slug: workspaces.slug })
        .from(workspaces)
        .where(eq(workspaces.organizationId, source.organizationId)),
      db
        .select({ slug: workspaces.slug })
        .from(workspaces)
        .where(eq(workspaces.organizationId, destination.organizationId)),
      db
        .select({ id: teams.id, slug: teams.slug })
        .from(teams)
        .where(eq(teams.organizationId, source.organizationId)),
      db
        .select({ slug: teams.slug })
        .from(teams)
        .where(eq(teams.organizationId, destination.organizationId)),
    ]);
  const [sourceMembers, sourceRoles, targetRoles] = await Promise.all([
    db
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, source.organizationId),
          eq(organizationMembers.status, "active"),
        ),
      ),
    db
      .select({ name: roles.name })
      .from(roles)
      .where(
        and(
          eq(roles.isSystem, false),
          eq(roles.ownerResourceType, "organization"),
          eq(roles.ownerResourceId, source.organizationId),
        ),
      ),
    db
      .select({ name: roles.name })
      .from(roles)
      .where(
        and(
          eq(roles.isSystem, false),
          eq(roles.ownerResourceType, "organization"),
          eq(roles.ownerResourceId, destination.organizationId),
        ),
      ),
  ]);

  const blockers: string[] = [];
  const targetProjectSlugs = new Set(targetProjects.map(({ slug }) => slug));
  const projectConflicts = sourceProjects
    .map(({ slug }) => slug)
    .filter((slug) => targetProjectSlugs.has(slug));
  if (projectConflicts.length > 0) {
    blockers.push(`Project URL conflict: ${projectConflicts.join(", ")}`);
  }
  const targetTeamSlugs = new Set(targetTeams.map(({ slug }) => slug));
  const teamConflicts = sourceTeams
    .map(({ slug }) => slug)
    .filter((slug) => targetTeamSlugs.has(slug));
  if (teamConflicts.length > 0) {
    blockers.push(`Team URL conflict: ${teamConflicts.join(", ")}`);
  }
  const targetRoleNames = new Set(targetRoles.map(({ name }) => name));
  const roleConflicts = sourceRoles
    .map(({ name }) => name)
    .filter((name) => targetRoleNames.has(name));
  if (roleConflicts.length > 0) {
    blockers.push(`Organization role conflict: ${roleConflicts.join(", ")}`);
  }

  const counts = {
    projects: sourceProjects.length,
    members: sourceMembers.length,
    teams: sourceTeams.length,
    roles: sourceRoles.length,
    resources: await resourceCount(sourceProjects.map(({ id }) => id)),
  };
  return {
    source: {
      organizationId: source.organizationId,
      organizationName: source.organizationName,
    },
    destination,
    counts,
    blockers,
    warnings: [
      "All projects, members, teams, custom organization roles, and tool policies will move together.",
      "The source organization will remain empty so it can be reviewed before deletion.",
    ],
    confirmationToken: transferFingerprint({
      sourceOrganizationId: source.organizationId,
      targetOrganizationId: destination.organizationId,
      counts,
      blockers,
    }),
  };
}

export async function executeOrganizationTransfer(
  input: Parameters<typeof previewOrganizationTransfer>[0] & {
    confirmationToken: string;
  },
) {
  const preview = await previewOrganizationTransfer(input);
  if (preview.blockers.length > 0) {
    throw new IamOperationError(preview.blockers.join(". "), 409);
  }
  if (preview.confirmationToken !== input.confirmationToken) {
    throw new IamOperationError(
      "The migration changed. Review it again before confirming.",
      409,
    );
  }
  const now = new Date();
  const sourceOrganizationId = preview.source.organizationId;
  const targetOrganizationId = preview.destination.organizationId;
  const memberRows = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, sourceOrganizationId),
        eq(organizationMembers.status, "active"),
      ),
    );
  const sourceBindings = await db
    .select()
    .from(roleBindings)
    .where(
      and(
        eq(roleBindings.resourceType, "organization"),
        eq(roleBindings.resourceId, sourceOrganizationId),
      ),
    );
  const sourcePolicies = await db
    .select()
    .from(organizationBuiltinToolPolicies)
    .where(
      eq(organizationBuiltinToolPolicies.organizationId, sourceOrganizationId),
    );

  await db.transaction(async (tx) => {
    for (const { userId } of memberRows) {
      await tx
        .insert(organizationMembers)
        .values({
          organizationId: targetOrganizationId,
          userId,
          status: "active",
        })
        .onConflictDoUpdate({
          target: [
            organizationMembers.organizationId,
            organizationMembers.userId,
          ],
          set: { status: "active", updatedAt: now },
        });
    }
    if (sourceBindings.length > 0) {
      await tx
        .insert(roleBindings)
        .values(
          sourceBindings.map((binding) => ({
            principalType: binding.principalType,
            principalId: binding.principalId,
            roleId: binding.roleId,
            resourceType: "organization" as const,
            resourceId: targetOrganizationId,
            conditionJson: binding.conditionJson,
            expiresAt: binding.expiresAt,
            createdById: binding.createdById,
          })),
        )
        .onConflictDoNothing();
      await tx.delete(roleBindings).where(
        inArray(
          roleBindings.id,
          sourceBindings.map(({ id }) => id),
        ),
      );
    }
    await tx
      .update(roles)
      .set({ ownerResourceId: targetOrganizationId, updatedAt: now })
      .where(
        and(
          eq(roles.isSystem, false),
          eq(roles.ownerResourceType, "organization"),
          eq(roles.ownerResourceId, sourceOrganizationId),
        ),
      );
    await tx
      .update(teams)
      .set({ organizationId: targetOrganizationId, updatedAt: now })
      .where(eq(teams.organizationId, sourceOrganizationId));
    await tx
      .update(workspaces)
      .set({ organizationId: targetOrganizationId, updatedAt: now })
      .where(eq(workspaces.organizationId, sourceOrganizationId));
    for (const policy of sourcePolicies) {
      await tx
        .insert(organizationBuiltinToolPolicies)
        .values({
          organizationId: targetOrganizationId,
          toolName: policy.toolName,
          enabled: policy.enabled,
          requireApproval: policy.requireApproval,
          updatedById: input.actorUserId,
        })
        .onConflictDoNothing();
    }
    if (sourcePolicies.length > 0) {
      await tx.delete(organizationBuiltinToolPolicies).where(
        inArray(
          organizationBuiltinToolPolicies.id,
          sourcePolicies.map(({ id }) => id),
        ),
      );
    }
    if (memberRows.length > 0) {
      await tx
        .update(organizationMembers)
        .set({ status: "removed", updatedAt: now })
        .where(
          and(
            eq(organizationMembers.organizationId, sourceOrganizationId),
            inArray(
              organizationMembers.userId,
              memberRows.map(({ userId }) => userId),
            ),
          ),
        );
    }
  });

  await Promise.all(
    memberRows.map(({ userId }) =>
      authorization.invalidatePrincipalPermissionCache(userId),
    ),
  );
  await audit.emit({
    organizationId: targetOrganizationId,
    workspaceId: preview.destination.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.actorUserId,
    action: "organization.transferred",
    resourceType: "organization",
    resourceId: sourceOrganizationId,
    outcome: "success",
    metadata: {
      sourceOrganizationId,
      targetOrganizationId,
      counts: preview.counts,
    },
  });
  return {
    transferred: preview.counts,
    destination: preview.destination,
  };
}

export async function previewOrganizationClone(input: {
  actorUserId: string;
  sourceWorkspaceId: string;
  targetOrganizationId: string;
  secretPolicy: "keep" | "disable";
}) {
  const transferPreview = await previewOrganizationTransfer(input);
  const preview = {
    ...transferPreview,
    blockers: [] as string[],
    warnings: [
      "Each source project will be created as a new project in the destination organization.",
      "Teams, members, custom roles, permissions, and organization tool policies will be copied. The source organization stays unchanged.",
      "Chats, execution history, audit logs, API keys, and pending requests stay in the source organization.",
      input.secretPolicy === "keep"
        ? "Encrypted provider, MCP, and connection secrets will be copied."
        : "Cloned providers, MCP servers, tools, and connections will be disabled until their secrets are configured.",
      "Project and team URLs receive a short suffix so cloning never overwrites existing content.",
    ],
  };
  return {
    ...preview,
    confirmationToken: createHash("sha256")
      .update(
        JSON.stringify({
          mode: "clone",
          sourceOrganizationId: preview.source.organizationId,
          targetOrganizationId: preview.destination.organizationId,
          counts: preview.counts,
          secretPolicy: input.secretPolicy,
        }),
      )
      .digest("hex"),
  };
}

export async function executeOrganizationClone(
  input: Parameters<typeof previewOrganizationClone>[0] & {
    confirmationToken: string;
  },
) {
  const preview = await previewOrganizationClone(input);
  if (preview.confirmationToken !== input.confirmationToken) {
    throw new IamOperationError(
      "The clone changed. Review it again before confirming.",
      409,
    );
  }
  const sourceOrganizationId = preview.source.organizationId;
  const targetOrganizationId = preview.destination.organizationId;
  const suffix = `copy-${randomUUID().slice(0, 8)}`;
  const sourceProjects = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.organizationId, sourceOrganizationId));
  const sourceMembers = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, sourceOrganizationId),
        eq(organizationMembers.status, "active"),
      ),
    );
  const sourceTeams = await db
    .select()
    .from(teams)
    .where(eq(teams.organizationId, sourceOrganizationId));
  const sourceCustomRoles = await db
    .select()
    .from(roles)
    .where(
      and(
        eq(roles.isSystem, false),
        eq(roles.ownerResourceType, "organization"),
        eq(roles.ownerResourceId, sourceOrganizationId),
      ),
    );
  const sourceBindings = await db
    .select()
    .from(roleBindings)
    .where(
      and(
        eq(roleBindings.resourceType, "organization"),
        eq(roleBindings.resourceId, sourceOrganizationId),
      ),
    );
  const sourcePolicies = await db
    .select()
    .from(organizationBuiltinToolPolicies)
    .where(
      eq(organizationBuiltinToolPolicies.organizationId, sourceOrganizationId),
    );

  const clonedProjects = await db.transaction(async (tx) => {
    const teamMap = new Map<string, string>();
    const roleMap = new Map<string, string>();
    for (const member of sourceMembers) {
      await tx
        .insert(organizationMembers)
        .values({
          organizationId: targetOrganizationId,
          userId: member.userId,
          status: "active",
        })
        .onConflictDoUpdate({
          target: [
            organizationMembers.organizationId,
            organizationMembers.userId,
          ],
          set: { status: "active", updatedAt: new Date() },
        });
    }
    for (const source of sourceTeams) {
      const id = randomUUID();
      teamMap.set(source.id, id);
      await tx.insert(teams).values({
        ...source,
        id,
        organizationId: targetOrganizationId,
        slug: `${source.slug}-${suffix}`,
        isDefault: false,
        createdById: input.actorUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const members = await tx
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.teamId, source.id));
      if (members.length > 0) {
        await tx.insert(teamMembers).values(
          members.map((member) => ({
            id: randomUUID(),
            teamId: id,
            userId: member.userId,
            createdAt: new Date(),
          })),
        );
      }
    }
    for (const source of sourceCustomRoles) {
      const id = randomUUID();
      roleMap.set(source.id, id);
      await tx.insert(roles).values({
        ...source,
        id,
        ownerResourceId: targetOrganizationId,
        name: `${source.name}-${suffix}`,
        createdById: input.actorUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    for (const source of sourceBindings) {
      const principalId =
        source.principalType === "group"
          ? teamMap.get(source.principalId)
          : source.principalId;
      if (!principalId) continue;
      await tx
        .insert(roleBindings)
        .values({
          ...source,
          id: randomUUID(),
          principalId,
          roleId: roleMap.get(source.roleId) ?? source.roleId,
          resourceId: targetOrganizationId,
          createdById: input.actorUserId,
          createdAt: new Date(),
        })
        .onConflictDoNothing();
    }
    for (const policy of sourcePolicies) {
      await tx
        .insert(organizationBuiltinToolPolicies)
        .values({
          organizationId: targetOrganizationId,
          toolName: policy.toolName,
          enabled: policy.enabled,
          requireApproval: policy.requireApproval,
          updatedById: input.actorUserId,
        })
        .onConflictDoNothing();
    }
    const adminRole = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.isSystem, true), eq(roles.name, "workspace.admin")))
      .limit(1);
    if (!adminRole[0]) {
      throw new IamOperationError("Project administrator role is missing", 500);
    }
    const results: { sourceWorkspaceId: string; workspaceId: string }[] = [];
    for (const source of sourceProjects) {
      const workspaceId = randomUUID();
      await tx.insert(workspaces).values({
        ...source,
        id: workspaceId,
        organizationId: targetOrganizationId,
        name: `${source.name} (copy)`,
        slug: `${source.slug}-${suffix}`,
        createdById: input.actorUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
      });
      await tx
        .insert(workspaceMembers)
        .values({
          workspaceId,
          userId: input.actorUserId,
          status: "active",
        })
        .onConflictDoNothing();
      await tx
        .insert(roleBindings)
        .values({
          principalType: "user",
          principalId: input.actorUserId,
          roleId: adminRole[0].id,
          resourceType: "workspace",
          resourceId: workspaceId,
          createdById: input.actorUserId,
        })
        .onConflictDoNothing();
      await cloneWorkspaceConfiguration(tx, {
        actorUserId: input.actorUserId,
        sourceWorkspaceId: source.id,
        targetWorkspaceId: workspaceId,
        targetOrganizationId,
        secretPolicy: input.secretPolicy,
        groupPrincipalMap: teamMap,
      });
      results.push({ sourceWorkspaceId: source.id, workspaceId });
    }
    return results;
  });

  await audit.emit({
    organizationId: targetOrganizationId,
    workspaceId: preview.destination.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.actorUserId,
    action: "organization.cloned",
    resourceType: "organization",
    resourceId: targetOrganizationId,
    outcome: "success",
    metadata: {
      sourceOrganizationId,
      targetOrganizationId,
      counts: preview.counts,
      clonedProjects,
      secretPolicy: input.secretPolicy,
    },
  });
  return {
    cloned: preview.counts,
    projects: clonedProjects,
    destination: preview.destination,
  };
}
