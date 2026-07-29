import { createHash } from "node:crypto";

import { and, count, eq, inArray, isNull, or } from "drizzle-orm";

import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import {
  ACCESS_RESOURCE_TYPES,
  type AccessResourceType,
} from "@/server/domain/entities/access-resource";
import { db } from "@/server/infrastructure/db";
import { findAccessResource } from "@/server/infrastructure/db/access-resource-repository";
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
import { getWorkspacesByUserId } from "@/modules/workspace/use-cases";
import { IamOperationError } from "./use-cases";

export const MEMBER_TRANSFER_MODES = ["add", "move"] as const;
export type MemberTransferMode = (typeof MEMBER_TRANSFER_MODES)[number];

type ProjectDestination = {
  workspaceId: string;
  workspaceName: string;
  organizationId: string;
  organizationName: string;
  crossOrganization: boolean;
  roles: Array<{ id: string; name: string; displayName: string }>;
};

export type MemberTransferPreview = {
  source: Omit<ProjectDestination, "roles" | "crossOrganization">;
  destination: Omit<ProjectDestination, "roles">;
  mode: MemberTransferMode;
  members: Array<{ userId: string; name: string; email: string }>;
  changes: {
    destinationMembershipsAdded: number;
    destinationAssignmentsAdded: number;
    sourceAssignmentsRemoved: number;
    sourceTeamMembershipsRemoved: number;
  };
  warnings: Array<
    "crossOrganizationMove" | "crossOrganizationAdd" | "sameOrganizationMove"
  >;
  blockers: string[];
  confirmationToken: string;
};

async function getProjectScope(workspaceId: string) {
  const [scope] = await db
    .select({ workspace: workspaces, organization: organizations })
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

async function requireTransferPermissions(input: {
  actorUserId: string;
  sourceWorkspaceId: string;
  sourceOrganizationId: string;
  targetWorkspaceId: string;
  targetOrganizationId: string;
  mode: MemberTransferMode;
}) {
  const crossOrganization =
    input.sourceOrganizationId !== input.targetOrganizationId;
  const checks = await Promise.all([
    hasPermission(
      input.actorUserId,
      "roles.manage",
      "workspace",
      input.sourceWorkspaceId,
    ),
    hasPermission(
      input.actorUserId,
      "roles.manage",
      "workspace",
      input.targetWorkspaceId,
    ),
    crossOrganization
      ? hasPermission(
          input.actorUserId,
          "members.manage",
          "organization",
          input.targetOrganizationId,
        )
      : Promise.resolve(true),
    crossOrganization && input.mode === "move"
      ? hasPermission(
          input.actorUserId,
          "members.manage",
          "organization",
          input.sourceOrganizationId,
        )
      : Promise.resolve(true),
  ]);
  if (checks.some((allowed) => !allowed)) {
    throw new IamOperationError(
      "You need access administration rights on both the source and destination",
      403,
    );
  }
}

async function listDestinationRoles(
  workspaceId: string,
  organizationId: string,
) {
  return db
    .select({
      id: roles.id,
      name: roles.name,
      displayName: roles.displayName,
    })
    .from(roles)
    .where(
      and(
        eq(roles.scopeType, "workspace"),
        or(
          eq(roles.isSystem, true),
          and(
            eq(roles.isSystem, false),
            eq(roles.ownerResourceType, "workspace"),
            eq(roles.ownerResourceId, workspaceId),
          ),
          and(
            eq(roles.isSystem, false),
            eq(roles.ownerResourceType, "organization"),
            eq(roles.ownerResourceId, organizationId),
          ),
        ),
      ),
    );
}

export async function listMemberTransferDestinations(input: {
  userId: string;
  sourceWorkspaceId: string;
}): Promise<ProjectDestination[]> {
  const source = await getProjectScope(input.sourceWorkspaceId);
  if (
    !(await hasPermission(
      input.userId,
      "roles.manage",
      "workspace",
      input.sourceWorkspaceId,
    ))
  ) {
    throw new IamOperationError(
      "You cannot transfer members from this project",
      403,
    );
  }
  const candidates = await getWorkspacesByUserId(input.userId);
  const destinations = await Promise.all(
    candidates
      .filter(({ workspace }) => workspace.id !== input.sourceWorkspaceId)
      .map(async ({ workspace, organization }) => {
        const crossOrganization = organization.id !== source.organization.id;
        const allowed = await hasPermission(
          input.userId,
          "roles.manage",
          "workspace",
          workspace.id,
        );
        const canAddMembers =
          !crossOrganization ||
          (await hasPermission(
            input.userId,
            "members.manage",
            "organization",
            organization.id,
          ));
        if (!allowed || !canAddMembers) return null;
        return {
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          organizationId: organization.id,
          organizationName: organization.name,
          crossOrganization,
          roles: await listDestinationRoles(workspace.id, organization.id),
        };
      }),
  );
  return destinations
    .filter((item): item is ProjectDestination => Boolean(item))
    .sort(
      (a, b) =>
        a.organizationName.localeCompare(b.organizationName) ||
        a.workspaceName.localeCompare(b.workspaceName),
    );
}

function fingerprint(input: {
  sourceWorkspaceId: string;
  targetWorkspaceId: string;
  userIds: string[];
  roleId: string;
  mode: MemberTransferMode;
  stateIds: string[];
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        sourceWorkspaceId: input.sourceWorkspaceId,
        targetWorkspaceId: input.targetWorkspaceId,
        userIds: [...input.userIds].sort(),
        roleId: input.roleId,
        mode: input.mode,
        stateIds: [...input.stateIds].sort(),
      }),
    )
    .digest("hex");
}

const accessResourceTypes = new Set<string>(ACCESS_RESOURCE_TYPES);

async function listSourceBindings(input: {
  userIds: string[];
  sourceWorkspaceId: string;
  sourceOrganizationId: string;
  includeWholeOrganization: boolean;
}) {
  const sourceWorkspaceIds = input.includeWholeOrganization
    ? (
        await db
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.organizationId, input.sourceOrganizationId))
      ).map(({ id }) => id)
    : [input.sourceWorkspaceId];
  const sourceWorkspaceIdSet = new Set(sourceWorkspaceIds);
  const candidates = await db
    .select({
      id: roleBindings.id,
      roleId: roleBindings.roleId,
      resourceType: roleBindings.resourceType,
      resourceId: roleBindings.resourceId,
    })
    .from(roleBindings)
    .where(
      and(
        eq(roleBindings.principalType, "user"),
        inArray(roleBindings.principalId, input.userIds),
      ),
    );
  const resolved = await Promise.all(
    candidates.map(async (binding) => {
      if (binding.resourceType === "organization") {
        return input.includeWholeOrganization &&
          binding.resourceId === input.sourceOrganizationId
          ? binding
          : null;
      }
      if (binding.resourceType === "workspace") {
        return sourceWorkspaceIdSet.has(binding.resourceId) ? binding : null;
      }
      if (!accessResourceTypes.has(binding.resourceType)) return null;
      const resource = await findAccessResource(
        binding.resourceType as AccessResourceType,
        binding.resourceId,
      );
      return resource && sourceWorkspaceIdSet.has(resource.workspaceId)
        ? binding
        : null;
    }),
  );
  return resolved.filter((binding): binding is NonNullable<typeof binding> =>
    Boolean(binding),
  );
}

export async function previewMemberTransfer(input: {
  actorUserId: string;
  sourceWorkspaceId: string;
  targetWorkspaceId: string;
  userIds: string[];
  roleId: string;
  mode: MemberTransferMode;
}): Promise<MemberTransferPreview> {
  if (input.sourceWorkspaceId === input.targetWorkspaceId) {
    throw new IamOperationError("Choose a different destination project");
  }
  const userIds = [...new Set(input.userIds)];
  const [source, target] = await Promise.all([
    getProjectScope(input.sourceWorkspaceId),
    getProjectScope(input.targetWorkspaceId),
  ]);
  await requireTransferPermissions({
    actorUserId: input.actorUserId,
    sourceWorkspaceId: input.sourceWorkspaceId,
    sourceOrganizationId: source.organization.id,
    targetWorkspaceId: input.targetWorkspaceId,
    targetOrganizationId: target.organization.id,
    mode: input.mode,
  });
  const crossOrganization = source.organization.id !== target.organization.id;

  const [destinationRole] = await db
    .select()
    .from(roles)
    .where(eq(roles.id, input.roleId))
    .limit(1);
  const roleIsCompatible =
    destinationRole?.scopeType === "workspace" &&
    (destinationRole.isSystem ||
      (destinationRole.ownerResourceType === "workspace" &&
        destinationRole.ownerResourceId === target.workspace.id) ||
      (destinationRole.ownerResourceType === "organization" &&
        destinationRole.ownerResourceId === target.organization.id));
  if (!roleIsCompatible) {
    throw new IamOperationError(
      "The selected role cannot be used in the destination project",
    );
  }

  const members = await db
    .select({ userId: users.id, name: users.name, email: users.email })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(
      and(
        eq(organizationMembers.organizationId, source.organization.id),
        eq(organizationMembers.status, "active"),
        inArray(organizationMembers.userId, userIds),
      ),
    );
  const blockers: string[] = [];
  if (members.length !== userIds.length) {
    blockers.push(
      "At least one selected person is no longer an active member of the source organization.",
    );
  }
  if (
    crossOrganization &&
    input.mode === "move" &&
    userIds.includes(input.actorUserId)
  ) {
    blockers.push("You cannot move your own account out of this organization.");
  }

  const [sourceBindings, sourceTeams, destinationMemberships] =
    await Promise.all([
      listSourceBindings({
        userIds,
        sourceWorkspaceId: source.workspace.id,
        sourceOrganizationId: source.organization.id,
        includeWholeOrganization: crossOrganization && input.mode === "move",
      }),
      crossOrganization && input.mode === "move"
        ? db
            .select({ id: teamMembers.id })
            .from(teamMembers)
            .innerJoin(teams, eq(teams.id, teamMembers.teamId))
            .where(
              and(
                eq(teams.organizationId, source.organization.id),
                inArray(teamMembers.userId, userIds),
              ),
            )
        : Promise.resolve([]),
      crossOrganization
        ? db
            .select({
              id: organizationMembers.id,
              userId: organizationMembers.userId,
              status: organizationMembers.status,
            })
            .from(organizationMembers)
            .where(
              and(
                eq(organizationMembers.organizationId, target.organization.id),
                inArray(organizationMembers.userId, userIds),
              ),
            )
        : Promise.resolve([]),
    ]);

  if (crossOrganization && input.mode === "move") {
    const [ownerRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(
        and(eq(roles.name, "organization.owner"), eq(roles.isSystem, true)),
      )
      .limit(1);
    if (ownerRole) {
      const [{ value: ownerCount }] = await db
        .select({ value: count() })
        .from(roleBindings)
        .where(
          and(
            eq(roleBindings.roleId, ownerRole.id),
            eq(roleBindings.principalType, "user"),
            eq(roleBindings.resourceType, "organization"),
            eq(roleBindings.resourceId, source.organization.id),
          ),
        );
      const selectedOwners = sourceBindings.filter(
        (binding) => binding.roleId === ownerRole.id,
      ).length;
      if (ownerCount - selectedOwners < 1) {
        blockers.push(
          "Assign another organization owner before moving the last owner.",
        );
      }
    }
  }

  const activeDestinationMembers = new Set(
    destinationMemberships
      .filter(({ status }) => status === "active")
      .map(({ userId }) => userId),
  );
  const warnings: MemberTransferPreview["warnings"] = [];
  if (crossOrganization && input.mode === "move") {
    warnings.push("crossOrganizationMove");
  } else if (crossOrganization) {
    warnings.push("crossOrganizationAdd");
  } else if (input.mode === "move") {
    warnings.push("sameOrganizationMove");
  }

  return {
    source: {
      workspaceId: source.workspace.id,
      workspaceName: source.workspace.name,
      organizationId: source.organization.id,
      organizationName: source.organization.name,
    },
    destination: {
      workspaceId: target.workspace.id,
      workspaceName: target.workspace.name,
      organizationId: target.organization.id,
      organizationName: target.organization.name,
      crossOrganization,
    },
    mode: input.mode,
    members,
    changes: {
      destinationMembershipsAdded: crossOrganization
        ? userIds.filter((id) => !activeDestinationMembers.has(id)).length
        : 0,
      destinationAssignmentsAdded: userIds.length,
      sourceAssignmentsRemoved:
        input.mode === "move" ? sourceBindings.length : 0,
      sourceTeamMembershipsRemoved:
        input.mode === "move" ? sourceTeams.length : 0,
    },
    warnings,
    blockers,
    confirmationToken: fingerprint({
      ...input,
      userIds,
      stateIds: [
        ...sourceBindings.map(({ id }) => id),
        ...sourceTeams.map(({ id }) => id),
        ...destinationMemberships.map(({ id, status }) => `${id}:${status}`),
      ],
    }),
  };
}

export async function executeMemberTransfer(
  input: Parameters<typeof previewMemberTransfer>[0] & {
    confirmationToken: string;
  },
) {
  const preview = await previewMemberTransfer(input);
  if (preview.blockers.length > 0) {
    throw new IamOperationError(preview.blockers.join(" "), 409);
  }
  if (preview.confirmationToken !== input.confirmationToken) {
    throw new IamOperationError(
      "Access changed since the preview. Review the transfer again.",
      409,
    );
  }
  const userIds = preview.members.map(({ userId }) => userId);
  const crossOrganization = preview.destination.crossOrganization;
  const [memberRole] = crossOrganization
    ? await db
        .select({ id: roles.id })
        .from(roles)
        .where(
          and(eq(roles.name, "organization.user"), eq(roles.isSystem, true)),
        )
        .limit(1)
    : [{ id: "" }];
  if (crossOrganization && !memberRole) {
    throw new IamOperationError("Destination member role is unavailable");
  }
  const sourceOrganizationWorkspaces =
    crossOrganization && input.mode === "move"
      ? await db
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.organizationId, preview.source.organizationId))
      : [];
  const sourceOrganizationTeams =
    crossOrganization && input.mode === "move"
      ? await db
          .select({ id: teams.id })
          .from(teams)
          .where(eq(teams.organizationId, preview.source.organizationId))
      : [];
  const sourceBindings =
    input.mode === "move"
      ? await listSourceBindings({
          userIds,
          sourceWorkspaceId: input.sourceWorkspaceId,
          sourceOrganizationId: preview.source.organizationId,
          includeWholeOrganization: crossOrganization,
        })
      : [];

  await db.transaction(async (tx) => {
    if (crossOrganization) {
      for (const userId of userIds) {
        await tx
          .insert(organizationMembers)
          .values({
            organizationId: preview.destination.organizationId,
            userId,
            status: "active",
          })
          .onConflictDoUpdate({
            target: [
              organizationMembers.organizationId,
              organizationMembers.userId,
            ],
            set: { status: "active", updatedAt: new Date() },
          });
        await tx
          .insert(roleBindings)
          .values({
            principalType: "user",
            principalId: userId,
            roleId: memberRole.id,
            resourceType: "organization",
            resourceId: preview.destination.organizationId,
            createdById: input.actorUserId,
          })
          .onConflictDoNothing();
      }
    }
    await tx
      .insert(roleBindings)
      .values(
        userIds.map((userId) => ({
          principalType: "user" as const,
          principalId: userId,
          roleId: input.roleId,
          resourceType: "workspace" as const,
          resourceId: input.targetWorkspaceId,
          createdById: input.actorUserId,
        })),
      )
      .onConflictDoNothing();

    if (input.mode === "move") {
      if (sourceBindings.length > 0) {
        await tx.delete(roleBindings).where(
          inArray(
            roleBindings.id,
            sourceBindings.map(({ id }) => id),
          ),
        );
      }
      if (crossOrganization) {
        if (sourceOrganizationTeams.length > 0) {
          await tx.delete(teamMembers).where(
            and(
              inArray(teamMembers.userId, userIds),
              inArray(
                teamMembers.teamId,
                sourceOrganizationTeams.map(({ id }) => id),
              ),
            ),
          );
        }
        if (sourceOrganizationWorkspaces.length > 0) {
          await tx.delete(workspaceMembers).where(
            and(
              inArray(workspaceMembers.userId, userIds),
              inArray(
                workspaceMembers.workspaceId,
                sourceOrganizationWorkspaces.map(({ id }) => id),
              ),
            ),
          );
        }
        await tx
          .update(organizationMembers)
          .set({ status: "removed", updatedAt: new Date() })
          .where(
            and(
              eq(
                organizationMembers.organizationId,
                preview.source.organizationId,
              ),
              inArray(organizationMembers.userId, userIds),
            ),
          );
      }
    }
  });

  await Promise.all(
    userIds.map((userId) =>
      authorization.invalidatePrincipalPermissionCache(userId),
    ),
  );
  await audit.emit({
    organizationId: preview.destination.organizationId,
    workspaceId: input.targetWorkspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.actorUserId,
    action:
      input.mode === "move"
        ? "organization.members.moved"
        : "organization.members.added_to_project",
    resourceType: "workspace",
    resourceId: input.targetWorkspaceId,
    outcome: "success",
    metadata: {
      sourceWorkspaceId: input.sourceWorkspaceId,
      userIds,
      roleId: input.roleId,
      crossOrganization,
    },
  });
  return { transferred: userIds.length, preview };
}
