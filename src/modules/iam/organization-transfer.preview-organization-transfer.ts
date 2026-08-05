
import { and,asc,eq } from "drizzle-orm";

import { db } from "@/server/infrastructure/db";
import {
organizationMembers,
roles,
teams,
workspaces
} from "@/server/infrastructure/db/schema";

import { OrganizationTransferPreview,listOrganizationTransferDestinations,requireOrganizationTransferPermissions,scopeForWorkspace,transferFingerprint } from "./organization-transfer.organization-transfer-destination";
import { planConflictResolutions,resourceCount } from "./organization-transfer.plan-conflict-resolutions";
import { IamOperationError } from "./use-cases";


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
        .select({
          id: workspaces.id,
          name: workspaces.name,
          slug: workspaces.slug,
        })
        .from(workspaces)
        .where(eq(workspaces.organizationId, source.organizationId))
        .orderBy(asc(workspaces.id)),
      db
        .select({ slug: workspaces.slug })
        .from(workspaces)
        .where(eq(workspaces.organizationId, destination.organizationId)),
      db
        .select({ id: teams.id, name: teams.name, slug: teams.slug })
        .from(teams)
        .where(eq(teams.organizationId, source.organizationId))
        .orderBy(asc(teams.id)),
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
      .select({
        id: roles.id,
        name: roles.name,
        displayName: roles.displayName,
      })
      .from(roles)
      .where(
        and(
          eq(roles.isSystem, false),
          eq(roles.ownerResourceType, "organization"),
          eq(roles.ownerResourceId, source.organizationId),
        ),
      )
      .orderBy(asc(roles.id)),
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
  const conflictResolutions = [
    ...planConflictResolutions({
      resourceType: "project",
      maxLength: 128,
      source: sourceProjects.map(({ id, name, slug }) => ({
        id,
        value: slug,
        label: name,
      })),
      targetValues: targetProjects.map(({ slug }) => slug),
    }),
    ...planConflictResolutions({
      resourceType: "team",
      maxLength: 128,
      source: sourceTeams.map(({ id, name, slug }) => ({
        id,
        value: slug,
        label: name,
      })),
      targetValues: targetTeams.map(({ slug }) => slug),
    }),
    ...planConflictResolutions({
      resourceType: "role",
      maxLength: 128,
      source: sourceRoles.map(({ id, name, displayName }) => ({
        id,
        value: name,
        label: displayName,
      })),
      targetValues: targetRoles.map(({ name }) => name),
    }),
  ];

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
    conflictResolutions,
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
      conflictResolutions,
    }),
  };
}
