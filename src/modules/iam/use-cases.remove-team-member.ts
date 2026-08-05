import { and, asc, count, eq, inArray, isNull, ne, or } from "drizzle-orm";

import { logger } from "@/lib/logger";
import {
  ACCESS_RESOURCE_DEFINITIONS,
  type AccessResourceType,
} from "@/server/domain/entities/access-resource";
import { audit } from "@/server/domain/services/audit";
import {
  authorization,
  canDelegatePermissionSet,
  matchesPermission,
} from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  findAccessResource,
  listAccessResources,
} from "@/server/infrastructure/db/access-resource-repository";
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
  expandPermissionGrants,
  isKnownPermission,
  isPermissionCompatibleWithScope,
  KNOWN_PERMISSIONS,
  PERMISSION_CATALOG,
} from "./permission-catalog";
import { createWorkspace } from "@/modules/workspace/use-cases";
import { IamOperationError, getWorkspaceScope, invalidateUserOrganizationAccess, requirePermission } from "./use-cases.iam-operation-error";


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
