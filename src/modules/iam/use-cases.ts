import { and, asc, count, eq, inArray, isNull, or } from "drizzle-orm";

import { logger } from "@/lib/logger";
import { audit } from "@/server/domain/services/audit";
import {
  authorization,
  matchesPermission,
} from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  organizationMembers,
  organizations,
  roleBindings,
  roles,
  teamMembers,
  teams,
  users,
  workspaceMembers,
  workspaces,
} from "@/server/infrastructure/db/schema";
import {
  isKnownPermission,
  isPermissionCompatibleWithScope,
  PERMISSION_CATALOG,
} from "./permission-catalog";
import { createWorkspace } from "@/modules/workspace/use-cases";

export class IamOperationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "IamOperationError";
  }
}

type ScopeType = "organization" | "workspace";
type AssignmentPrincipalType = "user" | "group";

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

function customRoleName(displayName: string) {
  const slug = normalizedSlug(displayName);
  return `custom.${slug || crypto.randomUUID().slice(0, 8)}`;
}

async function getWorkspaceScope(workspaceId: string) {
  const [row] = await db
    .select({ workspace: workspaces, organization: organizations })
    .from(workspaces)
    .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
    .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.archivedAt)))
    .limit(1);

  if (!row) throw new IamOperationError("Project not found", 404);
  return row;
}

async function requirePermission(input: {
  userId: string;
  permission: string;
  resourceType: ScopeType;
  resourceId: string;
  errorMessage: string;
}) {
  const result = await authorization.checkPermission(
    { principalType: "user", principalId: input.userId },
    input.permission,
    input.resourceType,
    input.resourceId,
  );
  if (!result.granted) {
    throw new IamOperationError(input.errorMessage, 403);
  }
}

async function invalidateUserOrganizationAccess(
  userId: string,
  organizationId: string,
) {
  const projectRows = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.organizationId, organizationId));

  await Promise.all([
    authorization.invalidatePermissionCache(
      userId,
      "organization",
      organizationId,
    ),
    ...projectRows.map(({ id }) =>
      authorization.invalidatePermissionCache(userId, "workspace", id),
    ),
  ]);
}

async function findSystemRole(name: string) {
  const [role] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.name, name), eq(roles.isSystem, true)))
    .limit(1);
  if (!role) throw new IamOperationError(`System role unavailable: ${name}`);
  return role;
}

export async function createOrganizationWithProject(input: {
  userId: string;
  organizationName: string;
  organizationSlug?: string;
  projectName: string;
  projectSlug?: string;
}) {
  const organizationSlug =
    normalizedSlug(input.organizationSlug ?? input.organizationName) ||
    crypto.randomUUID().slice(0, 8);
  const projectSlug =
    normalizedSlug(input.projectSlug ?? input.projectName) || "main";

  const existing = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, organizationSlug))
    .limit(1);
  if (existing.length > 0) {
    throw new IamOperationError("This organization URL is already in use", 409);
  }

  return createWorkspace({
    userId: input.userId,
    organizationName: input.organizationName.trim(),
    organizationSlug,
    workspaceName: input.projectName.trim(),
    workspaceSlug: projectSlug,
  });
}

export async function createProject(input: {
  userId: string;
  workspaceId: string;
  name: string;
  slug?: string;
}) {
  const { organization } = await getWorkspaceScope(input.workspaceId);
  const permission = await authorization.checkPermission(
    { principalType: "user", principalId: input.userId },
    "workspaces.create",
    "organization",
    organization.id,
  );
  if (!permission.granted) {
    throw new IamOperationError(
      "You do not have permission to create projects in this organization",
      403,
    );
  }

  const slug =
    normalizedSlug(input.slug ?? input.name) || crypto.randomUUID().slice(0, 8);
  const [existingProject] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.organizationId, organization.id),
        eq(workspaces.slug, slug),
      ),
    )
    .limit(1);
  if (existingProject) {
    throw new IamOperationError(
      "A project with this URL already exists in the organization",
      409,
    );
  }

  return createWorkspace({
    userId: input.userId,
    organizationName: organization.name,
    organizationSlug: organization.slug,
    workspaceName: input.name.trim(),
    workspaceSlug: slug,
  });
}

export async function addOrganizationMember(input: {
  actorUserId: string;
  workspaceId: string;
  email: string;
}) {
  const { organization } = await getWorkspaceScope(input.workspaceId);
  await requirePermission({
    userId: input.actorUserId,
    permission: "members.manage",
    resourceType: "organization",
    resourceId: organization.id,
    errorMessage: "You do not have permission to manage organization members",
  });
  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, input.email.trim().toLocaleLowerCase()))
    .limit(1);
  if (!user) {
    throw new IamOperationError(
      "No account matches this email. Create the account first.",
      404,
    );
  }

  const [existing] = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organization.id),
        eq(organizationMembers.userId, user.id),
      ),
    )
    .limit(1);
  const memberRole = await findSystemRole("organization.user");

  await db.transaction(async (tx) => {
    if (existing) {
      await tx
        .update(organizationMembers)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(organizationMembers.id, existing.id));
    } else {
      await tx.insert(organizationMembers).values({
        organizationId: organization.id,
        userId: user.id,
        status: "active",
      });
    }

    await tx
      .insert(roleBindings)
      .values({
        principalType: "user",
        principalId: user.id,
        roleId: memberRole.id,
        resourceType: "organization",
        resourceId: organization.id,
        createdById: input.actorUserId,
      })
      .onConflictDoNothing();
  });

  await invalidateUserOrganizationAccess(user.id, organization.id);
  await audit.emit({
    organizationId: organization.id,
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.actorUserId,
    action: "organization.member.added",
    resourceType: "organization",
    resourceId: organization.id,
    outcome: "success",
    metadata: { memberUserId: user.id },
  });
}

export async function createTeam(input: {
  actorUserId: string;
  workspaceId: string;
  name: string;
  description?: string;
}) {
  const { organization } = await getWorkspaceScope(input.workspaceId);
  await requirePermission({
    userId: input.actorUserId,
    permission: "teams.manage",
    resourceType: "organization",
    resourceId: organization.id,
    errorMessage: "You do not have permission to manage organization teams",
  });
  const slug = normalizedSlug(input.name) || crypto.randomUUID().slice(0, 8);
  const [existingTeam] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.organizationId, organization.id), eq(teams.slug, slug)))
    .limit(1);
  if (existingTeam) {
    throw new IamOperationError(
      "A team with this name already exists in the organization",
      409,
    );
  }

  const [team] = await db
    .insert(teams)
    .values({
      organizationId: organization.id,
      name: input.name.trim(),
      slug,
      description: input.description?.trim() || null,
      createdById: input.actorUserId,
    })
    .returning();

  await audit.emit({
    organizationId: organization.id,
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.actorUserId,
    action: "team.created",
    resourceType: "organization",
    resourceId: organization.id,
    outcome: "success",
    metadata: { teamId: team.id, teamName: team.name },
  });
  return team;
}

export async function addTeamMember(input: {
  actorUserId: string;
  workspaceId: string;
  teamId: string;
  userId: string;
}) {
  const { organization } = await getWorkspaceScope(input.workspaceId);
  await requirePermission({
    userId: input.actorUserId,
    permission: "teams.manage",
    resourceType: "organization",
    resourceId: organization.id,
    errorMessage: "You do not have permission to manage organization teams",
  });
  const [team] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(
      and(
        eq(teams.id, input.teamId),
        eq(teams.organizationId, organization.id),
      ),
    )
    .limit(1);
  const [member] = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organization.id),
        eq(organizationMembers.userId, input.userId),
        eq(organizationMembers.status, "active"),
      ),
    )
    .limit(1);
  if (!team || !member) {
    throw new IamOperationError(
      "The team and member must belong to this organization",
      404,
    );
  }

  await db
    .insert(teamMembers)
    .values({ teamId: team.id, userId: input.userId })
    .onConflictDoNothing();
  await invalidateUserOrganizationAccess(input.userId, organization.id);
  await audit.emit({
    organizationId: organization.id,
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.actorUserId,
    action: "team.member.added",
    resourceType: "organization",
    resourceId: organization.id,
    outcome: "success",
    metadata: { teamId: input.teamId, memberUserId: input.userId },
  });
}

export async function removeTeamMember(input: {
  actorUserId: string;
  workspaceId: string;
  teamId: string;
  userId: string;
}) {
  const { organization } = await getWorkspaceScope(input.workspaceId);
  await requirePermission({
    userId: input.actorUserId,
    permission: "teams.manage",
    resourceType: "organization",
    resourceId: organization.id,
    errorMessage: "You do not have permission to manage organization teams",
  });
  const [team] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(
      and(
        eq(teams.id, input.teamId),
        eq(teams.organizationId, organization.id),
      ),
    )
    .limit(1);
  if (!team) throw new IamOperationError("Team not found", 404);

  const removed = await db
    .delete(teamMembers)
    .where(
      and(
        eq(teamMembers.teamId, team.id),
        eq(teamMembers.userId, input.userId),
      ),
    )
    .returning({ id: teamMembers.id });
  if (removed.length === 0) {
    throw new IamOperationError("Team member not found", 404);
  }

  await invalidateUserOrganizationAccess(input.userId, organization.id);
  await audit.emit({
    organizationId: organization.id,
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.actorUserId,
    action: "team.member.removed",
    resourceType: "organization",
    resourceId: organization.id,
    outcome: "success",
    metadata: { teamId: input.teamId, memberUserId: input.userId },
  });
}

export async function deleteTeam(input: {
  actorUserId: string;
  workspaceId: string;
  teamId: string;
}) {
  const { organization } = await getWorkspaceScope(input.workspaceId);
  await requirePermission({
    userId: input.actorUserId,
    permission: "teams.manage",
    resourceType: "organization",
    resourceId: organization.id,
    errorMessage: "You do not have permission to manage organization teams",
  });
  const [team] = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(
      and(
        eq(teams.id, input.teamId),
        eq(teams.organizationId, organization.id),
      ),
    )
    .limit(1);
  if (!team) throw new IamOperationError("Team not found", 404);

  const affectedUsers = await db
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, team.id));
  await db.transaction(async (tx) => {
    await tx
      .delete(roleBindings)
      .where(
        and(
          eq(roleBindings.principalType, "group"),
          eq(roleBindings.principalId, team.id),
        ),
      );
    await tx.delete(teams).where(eq(teams.id, team.id));
  });

  await Promise.all(
    affectedUsers.map(({ userId }) =>
      invalidateUserOrganizationAccess(userId, organization.id),
    ),
  );
  await audit.emit({
    organizationId: organization.id,
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.actorUserId,
    action: "team.deleted",
    resourceType: "organization",
    resourceId: organization.id,
    outcome: "success",
    metadata: { teamId: team.id, teamName: team.name },
  });
}

export async function createCustomRole(input: {
  actorUserId: string;
  workspaceId: string;
  displayName: string;
  description?: string;
  scopeType: ScopeType;
  permissions: string[];
}) {
  const { organization } = await getWorkspaceScope(input.workspaceId);
  await requirePermission({
    userId: input.actorUserId,
    permission: "roles.manage",
    resourceType: input.scopeType,
    resourceId:
      input.scopeType === "organization" ? organization.id : input.workspaceId,
    errorMessage:
      input.scopeType === "organization"
        ? "You do not have permission to manage organization roles"
        : "You do not have permission to manage project roles",
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
      (permission) =>
        !isPermissionCompatibleWithScope(permission, input.scopeType),
    )
  ) {
    throw new IamOperationError(
      "One or more permissions cannot be used in a project role",
    );
  }

  const name = customRoleName(input.displayName);
  const ownerResourceType = input.scopeType;
  const ownerResourceId =
    input.scopeType === "organization" ? organization.id : input.workspaceId;
  const [existingRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(
      and(
        eq(roles.ownerResourceType, ownerResourceType),
        eq(roles.ownerResourceId, ownerResourceId),
        eq(roles.name, name),
      ),
    )
    .limit(1);
  if (existingRole) {
    throw new IamOperationError(
      "A custom role with this name already exists",
      409,
    );
  }

  const [role] = await db
    .insert(roles)
    .values({
      scopeType: input.scopeType,
      ownerResourceType,
      ownerResourceId,
      name,
      displayName: input.displayName.trim(),
      description: input.description?.trim() || null,
      permissionsJson: permissions,
      isSystem: false,
      createdById: input.actorUserId,
    })
    .returning();

  await audit.emit({
    organizationId: organization.id,
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.actorUserId,
    action: "iam.role.created",
    resourceType: input.scopeType,
    resourceId: ownerResourceId,
    outcome: "success",
    metadata: {
      roleId: role.id,
      scopeType: input.scopeType,
      permissionCount: permissions.length,
    },
  });
  return role;
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

async function validateAssignmentPrincipal(input: {
  organizationId: string;
  principalType: AssignmentPrincipalType;
  principalId: string;
}) {
  if (input.principalType === "user") {
    const [member] = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, input.organizationId),
          eq(organizationMembers.userId, input.principalId),
          eq(organizationMembers.status, "active"),
        ),
      )
      .limit(1);
    return Boolean(member);
  }

  const [team] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(
      and(
        eq(teams.organizationId, input.organizationId),
        eq(teams.id, input.principalId),
      ),
    )
    .limit(1);
  return Boolean(team);
}

export async function assignRole(input: {
  actorUserId: string;
  workspaceId: string;
  principalType: AssignmentPrincipalType;
  principalId: string;
  roleId: string;
  scopeType: ScopeType;
}) {
  const { organization } = await getWorkspaceScope(input.workspaceId);
  const [role] = await db
    .select()
    .from(roles)
    .where(eq(roles.id, input.roleId))
    .limit(1);
  if (
    !role ||
    role.scopeType !== input.scopeType ||
    (!role.isSystem &&
      !(
        (input.scopeType === "organization" &&
          role.ownerResourceType === "organization" &&
          role.ownerResourceId === organization.id) ||
        (input.scopeType === "workspace" &&
          role.ownerResourceType === "workspace" &&
          role.ownerResourceId === input.workspaceId)
      ))
  ) {
    throw new IamOperationError("This role cannot be used at this scope");
  }
  await requirePermission({
    userId: input.actorUserId,
    permission: "roles.manage",
    resourceType: input.scopeType,
    resourceId:
      input.scopeType === "organization" ? organization.id : input.workspaceId,
    errorMessage:
      input.scopeType === "organization"
        ? "You do not have permission to assign organization roles"
        : "You do not have permission to assign project roles",
  });
  if (role.name === "organization.owner" && input.principalType !== "user") {
    throw new IamOperationError(
      "Organization ownership must be assigned to a member directly",
    );
  }
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

  const resourceId =
    input.scopeType === "organization" ? organization.id : input.workspaceId;
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
      invalidateUserOrganizationAccess(userId, organization.id),
    ),
  );
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
  if (
    !binding ||
    !(
      (binding.binding.resourceType === "organization" &&
        binding.binding.resourceId === organization.id) ||
      (binding.binding.resourceType === "workspace" &&
        binding.binding.resourceId === input.workspaceId)
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
    resourceId: binding.binding.resourceId,
    errorMessage:
      binding.binding.resourceType === "organization"
        ? "You do not have permission to remove organization access"
        : "You do not have permission to remove project access",
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
      invalidateUserOrganizationAccess(userId, organization.id),
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

export async function getAccessConsoleSnapshot(input: {
  userId: string;
  workspaceId: string;
}) {
  const { workspace, organization } = await getWorkspaceScope(
    input.workspaceId,
  );
  const canView = await authorization.checkPermission(
    { principalType: "user", principalId: input.userId },
    "workspaces.get",
    "workspace",
    input.workspaceId,
  );
  if (!canView.granted) {
    throw new IamOperationError("You cannot view access for this project", 403);
  }

  const [
    projectRows,
    memberRows,
    teamRows,
    teamMemberRows,
    roleRows,
    bindingRows,
    effectivePermissions,
    organizationPermissions,
  ] = await Promise.all([
    db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
      })
      .from(workspaces)
      .where(
        and(
          eq(workspaces.organizationId, organization.id),
          isNull(workspaces.archivedAt),
        ),
      )
      .orderBy(asc(workspaces.name)),
    db
      .select({
        id: organizationMembers.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        status: organizationMembers.status,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(organizationMembers.userId, users.id))
      .where(eq(organizationMembers.organizationId, organization.id))
      .orderBy(asc(users.name)),
    db
      .select()
      .from(teams)
      .where(eq(teams.organizationId, organization.id))
      .orderBy(asc(teams.name)),
    db
      .select({
        id: teamMembers.id,
        teamId: teamMembers.teamId,
        userId: teamMembers.userId,
        name: users.name,
        email: users.email,
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(eq(teams.organizationId, organization.id)),
    db
      .select()
      .from(roles)
      .where(
        or(
          eq(roles.isSystem, true),
          and(
            eq(roles.ownerResourceType, "organization"),
            eq(roles.ownerResourceId, organization.id),
          ),
          and(
            eq(roles.ownerResourceType, "workspace"),
            eq(roles.ownerResourceId, input.workspaceId),
          ),
        ),
      )
      .orderBy(asc(roles.scopeType), asc(roles.displayName)),
    db
      .select({ binding: roleBindings, role: roles })
      .from(roleBindings)
      .innerJoin(roles, eq(roleBindings.roleId, roles.id))
      .where(
        or(
          and(
            eq(roleBindings.resourceType, "organization"),
            eq(roleBindings.resourceId, organization.id),
          ),
          and(
            eq(roleBindings.resourceType, "workspace"),
            eq(roleBindings.resourceId, input.workspaceId),
          ),
        ),
      ),
    authorization.listPermissions(
      { principalType: "user", principalId: input.userId },
      "workspace",
      input.workspaceId,
    ),
    authorization.listPermissions(
      { principalType: "user", principalId: input.userId },
      "organization",
      organization.id,
    ),
  ]);

  const memberNames = new Map(
    memberRows.map((member) => [
      member.userId,
      { name: member.name, email: member.email },
    ]),
  );
  const teamNames = new Map(
    teamRows.map((team) => [team.id, { name: team.name }]),
  );
  const hasWorkspacePermission = (permission: string) =>
    effectivePermissions.some((granted) =>
      matchesPermission(granted, permission),
    );
  const hasOrganizationPermission = (permission: string) =>
    organizationPermissions.some((granted) =>
      matchesPermission(granted, permission),
    );
  const capabilities = {
    canManageProjectAccess: hasWorkspacePermission("roles.manage"),
    canManageOrganizationAccess: hasOrganizationPermission("roles.manage"),
    canCreateProjects: hasOrganizationPermission("workspaces.create"),
    canManageMembers: hasOrganizationPermission("members.manage"),
    canManageTeams: hasOrganizationPermission("teams.manage"),
  };
  if (!Object.values(capabilities).some(Boolean)) {
    throw new IamOperationError(
      "You do not have permission to view organization access",
      403,
    );
  }

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
    },
    activeProject: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
    },
    projects: projectRows,
    members: memberRows,
    teams: teamRows.map((team) => ({
      ...team,
      members: teamMemberRows.filter((member) => member.teamId === team.id),
    })),
    roles: roleRows.map((role) => ({
      ...role,
      permissions: Array.isArray(role.permissionsJson)
        ? role.permissionsJson
        : [],
    })),
    assignments: bindingRows.map(({ binding, role }) => {
      const memberPrincipal =
        binding.principalType === "user"
          ? memberNames.get(binding.principalId)
          : undefined;
      const teamPrincipal =
        binding.principalType === "group"
          ? teamNames.get(binding.principalId)
          : undefined;
      const principal = memberPrincipal ?? teamPrincipal;
      return {
        id: binding.id,
        principalType:
          binding.principalType === "group" ? "team" : binding.principalType,
        principalId: binding.principalId,
        principalName: principal?.name ?? "Unknown principal",
        principalDetail: memberPrincipal?.email,
        roleId: role.id,
        roleName: role.displayName,
        roleKey: role.name,
        scope:
          binding.resourceType === "organization" ? "organization" : "project",
        inherited: binding.resourceType === "organization",
      };
    }),
    permissionCatalog: PERMISSION_CATALOG,
    effectivePermissions,
    capabilities,
    canManageAccess:
      capabilities.canManageProjectAccess ||
      capabilities.canManageOrganizationAccess,
  };
}

export async function removeOrganizationMember(input: {
  actorUserId: string;
  workspaceId: string;
  userId: string;
}) {
  const { organization } = await getWorkspaceScope(input.workspaceId);
  await requirePermission({
    userId: input.actorUserId,
    permission: "members.manage",
    resourceType: "organization",
    resourceId: organization.id,
    errorMessage: "You do not have permission to manage organization members",
  });
  if (input.userId === input.actorUserId) {
    throw new IamOperationError(
      "You cannot remove your own organization access",
      409,
    );
  }
  const ownerRole = await findSystemRole("organization.owner");
  const [ownerBinding] = await db
    .select({ id: roleBindings.id })
    .from(roleBindings)
    .where(
      and(
        eq(roleBindings.principalType, "user"),
        eq(roleBindings.principalId, input.userId),
        eq(roleBindings.roleId, ownerRole.id),
        eq(roleBindings.resourceType, "organization"),
        eq(roleBindings.resourceId, organization.id),
      ),
    )
    .limit(1);
  if (ownerBinding) {
    const [{ value }] = await db
      .select({ value: count() })
      .from(roleBindings)
      .where(
        and(
          eq(roleBindings.roleId, ownerRole.id),
          eq(roleBindings.principalType, "user"),
          eq(roleBindings.resourceType, "organization"),
          eq(roleBindings.resourceId, organization.id),
        ),
      );
    if (value <= 1) {
      throw new IamOperationError(
        "Assign another organization owner before removing this member",
        409,
      );
    }
  }

  const memberTeams = await db
    .select({ id: teams.id })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(
      and(
        eq(teamMembers.userId, input.userId),
        eq(teams.organizationId, organization.id),
      ),
    );

  await db.transaction(async (tx) => {
    if (memberTeams.length > 0) {
      await tx.delete(teamMembers).where(
        and(
          eq(teamMembers.userId, input.userId),
          inArray(
            teamMembers.teamId,
            memberTeams.map(({ id }) => id),
          ),
        ),
      );
    }
    await tx.delete(workspaceMembers).where(
      and(
        eq(workspaceMembers.userId, input.userId),
        inArray(
          workspaceMembers.workspaceId,
          (
            await tx
              .select({ id: workspaces.id })
              .from(workspaces)
              .where(eq(workspaces.organizationId, organization.id))
          ).map(({ id }) => id),
        ),
      ),
    );
    await tx.delete(roleBindings).where(
      and(
        eq(roleBindings.principalType, "user"),
        eq(roleBindings.principalId, input.userId),
        or(
          and(
            eq(roleBindings.resourceType, "organization"),
            eq(roleBindings.resourceId, organization.id),
          ),
          and(
            eq(roleBindings.resourceType, "workspace"),
            inArray(
              roleBindings.resourceId,
              (
                await tx
                  .select({ id: workspaces.id })
                  .from(workspaces)
                  .where(eq(workspaces.organizationId, organization.id))
              ).map(({ id }) => id),
            ),
          ),
        ),
      ),
    );
    await tx
      .update(organizationMembers)
      .set({ status: "removed", updatedAt: new Date() })
      .where(
        and(
          eq(organizationMembers.organizationId, organization.id),
          eq(organizationMembers.userId, input.userId),
        ),
      );
  });

  await invalidateUserOrganizationAccess(input.userId, organization.id);
  await audit.emit({
    organizationId: organization.id,
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.actorUserId,
    action: "organization.member.removed",
    resourceType: "organization",
    resourceId: organization.id,
    outcome: "success",
    metadata: { memberUserId: input.userId },
  });
  logger.info("Organization member removed", {
    organizationId: organization.id,
    userId: input.userId,
    actorUserId: input.actorUserId,
  });
}
