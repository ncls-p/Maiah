import { and,eq } from "drizzle-orm";

import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
organizationMembers,
roleBindings,
teamMembers,
teams,
users
} from "@/server/infrastructure/db/schema";
import { findSystemRole,getWorkspaceScope,IamOperationError,invalidateUserOrganizationAccess,normalizedSlug,requirePermission } from "./use-cases.iam-operation-error";


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
