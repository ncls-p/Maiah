import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  addOrganizationMember,
  addTeamMember,
  assignRole,
  createCustomRole,
  createOrganizationWithProject,
  createProject,
  createTeam,
  deleteCustomRole,
  deleteTeam,
  getAccessConsoleSnapshot,
  removeOrganizationMember,
  removeRoleAssignment,
  removeTeamMember,
  updateCustomRole,
} from "@/modules/iam/use-cases";
import { db } from "@/server/infrastructure/db";
import {
  auditEvents,
  organizations,
  roleBindings,
  roles,
  users,
  workspaces,
} from "@/server/infrastructure/db/schema";

const describeWithDatabase = process.env.IAM_INTEGRATION_DATABASE_URL
  ? describe.sequential
  : describe.skip;

describeWithDatabase("hierarchical IAM use cases on PostgreSQL", () => {
  const suffix = randomUUID().slice(0, 8);
  const ownerId = randomUUID();
  const memberId = randomUUID();
  const outsiderId = randomUUID();
  const userIds = [ownerId, memberId, outsiderId];
  const organizationIds: string[] = [];

  const ownerEmail = `iam-owner-${suffix}@example.test`;
  const memberEmail = `iam-member-${suffix}@example.test`;
  const outsiderEmail = `iam-outsider-${suffix}@example.test`;

  let organizationId = "";
  let firstProjectId = "";
  let secondProjectId = "";

  beforeAll(async () => {
    await db.insert(users).values([
      {
        id: ownerId,
        name: "IAM Owner",
        email: ownerEmail,
        emailVerified: true,
      },
      {
        id: memberId,
        name: "IAM Member",
        email: memberEmail,
        emailVerified: true,
      },
      {
        id: outsiderId,
        name: "IAM Outsider",
        email: outsiderEmail,
        emailVerified: true,
      },
    ]);
  });

  afterAll(async () => {
    if (organizationIds.length > 0) {
      await db
        .delete(auditEvents)
        .where(inArray(auditEvents.organizationId, organizationIds));
    }
    await db
      .delete(roleBindings)
      .where(inArray(roleBindings.createdById, userIds));
    await db.delete(roles).where(inArray(roles.createdById, userIds));
    if (organizationIds.length > 0) {
      await db
        .delete(organizations)
        .where(inArray(organizations.id, organizationIds));
    }
    await db.delete(users).where(inArray(users.id, userIds));
  });

  it("manages an organization, projects, teams, scoped roles, and cleanup", async () => {
    const firstProject = await createOrganizationWithProject({
      userId: ownerId,
      organizationName: `IAM Organization ${suffix}`,
      organizationSlug: `iam-org-${suffix}`,
      projectName: "Operations",
      projectSlug: "operations",
    });
    firstProjectId = firstProject.id;

    const [scope] = await db
      .select({ organizationId: workspaces.organizationId })
      .from(workspaces)
      .where(eq(workspaces.id, firstProjectId))
      .limit(1);
    organizationId = scope.organizationId;
    organizationIds.push(organizationId);

    const secondProject = await createProject({
      userId: ownerId,
      workspaceId: firstProjectId,
      name: "Customer Hub",
      slug: "customer-hub",
    });
    secondProjectId = secondProject.id;

    await addOrganizationMember({
      actorUserId: ownerId,
      workspaceId: firstProjectId,
      email: memberEmail,
    });

    const team = await createTeam({
      actorUserId: ownerId,
      workspaceId: firstProjectId,
      name: "Support Leads",
      description: "Shared support access",
    });
    await addTeamMember({
      actorUserId: ownerId,
      workspaceId: firstProjectId,
      teamId: team.id,
      userId: memberId,
    });

    const projectRole = await createCustomRole({
      actorUserId: ownerId,
      workspaceId: secondProjectId,
      displayName: "Support Reader",
      description: "Read assistants and workflows",
      scopeType: "workspace",
      permissions: ["agents.view", "workflows.view"],
    });
    await assignRole({
      actorUserId: ownerId,
      workspaceId: secondProjectId,
      principalType: "group",
      principalId: team.id,
      roleId: projectRole.id,
      scopeType: "workspace",
    });
    const updatedProjectRole = await updateCustomRole({
      actorUserId: ownerId,
      workspaceId: secondProjectId,
      roleId: projectRole.id,
      displayName: "Support Operator",
      description: "Read assistants and run workflows",
      permissions: ["agents.view", "workflows.view", "workflows.execute"],
    });
    expect(updatedProjectRole).toMatchObject({
      displayName: "Support Operator",
      permissionsJson: ["agents.view", "workflows.view", "workflows.execute"],
    });

    const snapshot = await getAccessConsoleSnapshot({
      userId: ownerId,
      workspaceId: secondProjectId,
    });

    expect(snapshot.organization.id).toBe(organizationId);
    expect(snapshot.projects.map(({ id }) => id)).toEqual(
      expect.arrayContaining([firstProjectId, secondProjectId]),
    );
    expect(snapshot.capabilities).toEqual({
      canManageProjectAccess: true,
      canManageOrganizationAccess: true,
      canCreateProjects: true,
      canManageMembers: true,
      canManageTeams: true,
    });
    expect(snapshot.assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          principalId: ownerId,
          roleKey: "organization.owner",
          inherited: true,
        }),
        expect.objectContaining({
          principalId: team.id,
          roleId: projectRole.id,
          scope: "project",
        }),
      ]),
    );
    expect(
      snapshot.roles.find(({ id }) => id === projectRole.id),
    ).toMatchObject({
      displayName: "Support Operator",
      permissions: ["agents.view", "workflows.view", "workflows.execute"],
    });

    const [teamBinding] = await db
      .select({ id: roleBindings.id })
      .from(roleBindings)
      .where(
        and(
          eq(roleBindings.principalType, "group"),
          eq(roleBindings.principalId, team.id),
          eq(roleBindings.roleId, projectRole.id),
        ),
      )
      .limit(1);

    await removeRoleAssignment({
      actorUserId: ownerId,
      workspaceId: secondProjectId,
      bindingId: teamBinding.id,
    });
    await deleteCustomRole({
      actorUserId: ownerId,
      workspaceId: secondProjectId,
      roleId: projectRole.id,
    });
    await removeTeamMember({
      actorUserId: ownerId,
      workspaceId: firstProjectId,
      teamId: team.id,
      userId: memberId,
    });
    await deleteTeam({
      actorUserId: ownerId,
      workspaceId: firstProjectId,
      teamId: team.id,
    });
    await removeOrganizationMember({
      actorUserId: ownerId,
      workspaceId: firstProjectId,
      userId: memberId,
    });

    await expect(
      getAccessConsoleSnapshot({
        userId: memberId,
        workspaceId: firstProjectId,
      }),
    ).rejects.toMatchObject({ status: 403 });
  }, 30_000);

  it("rejects privilege escalation and cross-organization identifiers", async () => {
    await expect(
      createOrganizationWithProject({
        userId: outsiderId,
        organizationName: "Duplicate",
        organizationSlug: `iam-org-${suffix}`,
        projectName: "Duplicate",
      }),
    ).rejects.toMatchObject({ status: 409 });

    await addOrganizationMember({
      actorUserId: ownerId,
      workspaceId: firstProjectId,
      email: memberEmail,
    });

    await expect(
      createProject({
        userId: memberId,
        workspaceId: firstProjectId,
        name: "Escalated project",
      }),
    ).rejects.toMatchObject({ status: 403 });

    await expect(
      createCustomRole({
        actorUserId: ownerId,
        workspaceId: firstProjectId,
        displayName: "Invalid project role",
        scopeType: "workspace",
        permissions: ["members.manage"],
      }),
    ).rejects.toMatchObject({ status: 400 });

    const immutableSystemRole = await db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.name, "workspace.viewer"), eq(roles.isSystem, true)))
      .limit(1);
    await expect(
      updateCustomRole({
        actorUserId: ownerId,
        workspaceId: firstProjectId,
        roleId: immutableSystemRole[0].id,
        displayName: "Unsafe override",
        permissions: ["workspaces.get"],
      }),
    ).rejects.toMatchObject({ status: 404 });

    await expect(
      addOrganizationMember({
        actorUserId: ownerId,
        workspaceId: firstProjectId,
        email: `missing-${suffix}@example.test`,
      }),
    ).rejects.toMatchObject({ status: 404 });

    const otherProject = await createOrganizationWithProject({
      userId: outsiderId,
      organizationName: `Other IAM Organization ${suffix}`,
      organizationSlug: `other-iam-org-${suffix}`,
      projectName: "External",
      projectSlug: "external",
    });
    const [otherScope] = await db
      .select({ organizationId: workspaces.organizationId })
      .from(workspaces)
      .where(eq(workspaces.id, otherProject.id))
      .limit(1);
    organizationIds.push(otherScope.organizationId);

    const externalTeam = await createTeam({
      actorUserId: outsiderId,
      workspaceId: otherProject.id,
      name: "External Team",
    });
    const viewerRole = await db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.name, "workspace.viewer"), eq(roles.isSystem, true)))
      .limit(1);

    await expect(
      assignRole({
        actorUserId: ownerId,
        workspaceId: firstProjectId,
        principalType: "group",
        principalId: externalTeam.id,
        roleId: viewerRole[0].id,
        scopeType: "workspace",
      }),
    ).rejects.toMatchObject({ status: 400 });

    const localRole = await createCustomRole({
      actorUserId: ownerId,
      workspaceId: firstProjectId,
      displayName: "First project only",
      scopeType: "workspace",
      permissions: ["workflows.view"],
    });

    await expect(
      assignRole({
        actorUserId: ownerId,
        workspaceId: secondProjectId,
        principalType: "user",
        principalId: memberId,
        roleId: localRole.id,
        scopeType: "workspace",
      }),
    ).rejects.toMatchObject({ status: 400 });

    const [ownerBinding] = await db
      .select({ id: roleBindings.id })
      .from(roleBindings)
      .innerJoin(roles, eq(roleBindings.roleId, roles.id))
      .where(
        and(
          eq(roles.name, "organization.owner"),
          eq(roleBindings.resourceType, "organization"),
          eq(roleBindings.resourceId, organizationId),
        ),
      )
      .limit(1);

    await expect(
      removeRoleAssignment({
        actorUserId: ownerId,
        workspaceId: firstProjectId,
        bindingId: ownerBinding.id,
      }),
    ).rejects.toMatchObject({ status: 409 });

    await expect(
      removeOrganizationMember({
        actorUserId: ownerId,
        workspaceId: firstProjectId,
        userId: ownerId,
      }),
    ).rejects.toMatchObject({ status: 409 });
  }, 30_000);
});
