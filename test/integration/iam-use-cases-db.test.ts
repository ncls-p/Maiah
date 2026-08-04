import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { encryptValue } from "@/lib/crypto";
import { claimAssistantContinuation } from "@/modules/chat/continuation";
import { listAgents } from "@/modules/agent/use-cases";
import { deleteProjectAccessResource } from "@/modules/iam/resource-deletion";
import {
  executeMemberTransfer,
  listMemberTransferDestinations,
  previewMemberTransfer,
} from "@/modules/iam/member-transfer";
import {
  executeOrganizationClone,
  executeOrganizationTransfer,
  previewOrganizationClone,
  previewOrganizationTransfer,
} from "@/modules/iam/organization-transfer";
import {
  executeResourceTransfer,
  listResourceTransferDestinations,
  previewResourceTransfer,
} from "@/modules/iam/resource-transfer";
import {
  executeWorkspaceClone,
  previewWorkspaceClone,
} from "@/modules/iam/workspace-clone";
import {
  deleteOrganization,
  deleteProject,
  renameOrganization,
  renameProject,
} from "@/modules/iam/scope-lifecycle";
import {
  addOrganizationMember,
  addTeamMember,
  assignRole,
  assignResourceRole,
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
  agents,
  agentVersions,
  aiModels,
  aiProviders,
  auditEvents,
  conversations,
  messageParts,
  messages,
  organizations,
  organizationMembers,
  roleBindings,
  roles,
  teamMembers,
  teams,
  users,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { authorization } from "@/server/domain/services/authorization";

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
  let sharedAgentId = "";

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
      permissions: ["agents.get", "workflows.view"],
    });
    const resourceRole = await createCustomRole({
      actorUserId: ownerId,
      workspaceId: secondProjectId,
      displayName: "Assistant Reader",
      description: "Read one selected assistant",
      scopeType: "workspace",
      permissions: ["agents.get"],
    });
    const [sharedAgent, privateAgent] = await db
      .insert(agents)
      .values([
        {
          workspaceId: secondProjectId,
          name: "Shared assistant",
          slug: `shared-${suffix}`,
          createdById: ownerId,
        },
        {
          workspaceId: secondProjectId,
          name: "Private assistant",
          slug: `private-${suffix}`,
          createdById: ownerId,
        },
      ])
      .returning();
    const [memberOwnedAgent] = await db
      .insert(agents)
      .values({
        workspaceId: secondProjectId,
        name: "Member private assistant",
        slug: `member-private-${suffix}`,
        createdById: memberId,
      })
      .returning();
    sharedAgentId = sharedAgent.id;
    expect(
      (await listAgents(secondProjectId, ownerId, true)).map(({ id }) => id),
    ).not.toContain(memberOwnedAgent.id);
    await assignResourceRole({
      actorUserId: ownerId,
      workspaceId: secondProjectId,
      principalType: "user",
      principalId: ownerId,
      roleId: resourceRole.id,
      resourceType: "agent",
      resourceId: memberOwnedAgent.id,
    });
    expect(
      (await listAgents(secondProjectId, ownerId, true)).map(({ id }) => id),
    ).toContain(memberOwnedAgent.id);
    await deleteProjectAccessResource({
      actorUserId: ownerId,
      workspaceId: secondProjectId,
      resourceType: "agent",
      resourceId: memberOwnedAgent.id,
    });
    expect(
      (await listAgents(secondProjectId, ownerId, true)).map(({ id }) => id),
    ).not.toContain(memberOwnedAgent.id);
    await assignResourceRole({
      actorUserId: ownerId,
      workspaceId: secondProjectId,
      principalType: "user",
      principalId: memberId,
      roleId: resourceRole.id,
      resourceType: "agent",
      resourceId: sharedAgent.id,
    });
    expect(
      await authorization.hasPermission(
        { principalType: "user", principalId: memberId },
        "agents.get",
        "agent",
        sharedAgent.id,
      ),
    ).toBe(true);
    expect(
      await authorization.hasPermission(
        { principalType: "user", principalId: memberId },
        "agents.get",
        "agent",
        privateAgent.id,
      ),
    ).toBe(false);
    const [provider] = await db
      .insert(aiProviders)
      .values({
        workspaceId: secondProjectId,
        kind: "openai-compatible",
        name: "Scoped provider",
        authType: "bearer",
        createdById: ownerId,
      })
      .returning();
    const [model] = await db
      .insert(aiModels)
      .values({
        providerId: provider.id,
        modelId: "scoped-model",
        displayName: "Scoped model",
      })
      .returning();
    const modelRole = await createCustomRole({
      actorUserId: ownerId,
      workspaceId: secondProjectId,
      displayName: "Model User",
      scopeType: "workspace",
      permissions: ["models.view", "models.invoke"],
    });
    await assignResourceRole({
      actorUserId: ownerId,
      workspaceId: secondProjectId,
      principalType: "user",
      principalId: memberId,
      roleId: modelRole.id,
      resourceType: "provider",
      resourceId: provider.id,
    });
    expect(
      await authorization.hasPermission(
        { principalType: "user", principalId: memberId },
        "models.invoke",
        "model",
        model.id,
      ),
    ).toBe(true);

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
      permissions: ["agents.get", "workflows.view", "workflows.execute"],
    });
    expect(updatedProjectRole).toMatchObject({
      displayName: "Support Operator",
      permissionsJson: ["agents.get", "workflows.view", "workflows.execute"],
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
      canManageProjectLifecycle: true,
      canManageOrganizationLifecycle: true,
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
      permissions: ["agents.get", "workflows.view", "workflows.execute"],
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
    const [resourceBinding] = await db
      .select({ id: roleBindings.id })
      .from(roleBindings)
      .where(
        and(
          eq(roleBindings.principalType, "user"),
          eq(roleBindings.principalId, memberId),
          eq(roleBindings.roleId, resourceRole.id),
          eq(roleBindings.resourceType, "agent"),
          eq(roleBindings.resourceId, sharedAgent.id),
        ),
      )
      .limit(1);
    await removeRoleAssignment({
      actorUserId: ownerId,
      workspaceId: secondProjectId,
      bindingId: resourceBinding.id,
    });
    await deleteCustomRole({
      actorUserId: ownerId,
      workspaceId: secondProjectId,
      roleId: resourceRole.id,
    });
    const [modelBinding] = await db
      .select({ id: roleBindings.id })
      .from(roleBindings)
      .where(
        and(
          eq(roleBindings.principalType, "user"),
          eq(roleBindings.principalId, memberId),
          eq(roleBindings.roleId, modelRole.id),
          eq(roleBindings.resourceType, "provider"),
          eq(roleBindings.resourceId, provider.id),
        ),
      )
      .limit(1);
    await removeRoleAssignment({
      actorUserId: ownerId,
      workspaceId: secondProjectId,
      bindingId: modelBinding.id,
    });
    await deleteCustomRole({
      actorUserId: ownerId,
      workspaceId: secondProjectId,
      roleId: modelRole.id,
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
  }, 60_000);

  it("previews and atomically transfers a linked assistant bundle", async () => {
    const [provider] = await db
      .insert(aiProviders)
      .values({
        workspaceId: secondProjectId,
        kind: "openai-compatible",
        name: `Transfer provider ${suffix}`,
        authType: "bearer",
        encryptedApiKey: await encryptValue("transfer-secret"),
        createdById: ownerId,
      })
      .returning();
    const [model] = await db
      .insert(aiModels)
      .values({
        providerId: provider.id,
        modelId: `transfer-model-${suffix}`,
        displayName: "Transfer model",
      })
      .returning();
    const [agent] = await db
      .insert(agents)
      .values({
        workspaceId: secondProjectId,
        name: `Transfer assistant ${suffix}`,
        slug: `transfer-assistant-${suffix}`,
        createdById: ownerId,
      })
      .returning();
    const [version] = await db
      .insert(agentVersions)
      .values({
        agentId: agent.id,
        versionNumber: 1,
        providerId: provider.id,
        modelId: model.id,
        createdById: ownerId,
      })
      .returning();
    await db
      .update(agents)
      .set({ activeVersionId: version.id })
      .where(eq(agents.id, agent.id));
    const [conversation] = await db
      .insert(conversations)
      .values({
        workspaceId: secondProjectId,
        agentId: agent.id,
        agentVersionId: version.id,
        userId: ownerId,
        title: "Transfer history",
      })
      .returning();

    const destinations = await listResourceTransferDestinations({
      userId: ownerId,
      sourceWorkspaceId: secondProjectId,
    });
    expect(destinations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ workspaceId: firstProjectId }),
      ]),
    );

    const options = {
      includeDependencies: true,
      accessPolicy: "compatible" as const,
      ownershipPolicy: "actor" as const,
      secretPolicy: "disable" as const,
    };
    const blockedPreview = await previewResourceTransfer({
      actorUserId: ownerId,
      sourceWorkspaceId: secondProjectId,
      targetWorkspaceId: firstProjectId,
      resourceType: "agent",
      resourceId: agent.id,
      options: { ...options, includeDependencies: false },
    });
    expect(blockedPreview.blockers).toEqual([
      expect.stringContaining("linked resource"),
    ]);

    const preview = await previewResourceTransfer({
      actorUserId: ownerId,
      sourceWorkspaceId: secondProjectId,
      targetWorkspaceId: firstProjectId,
      resourceType: "agent",
      resourceId: agent.id,
      options,
    });
    expect(preview.blockers).toEqual([]);
    expect(preview.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "agent", id: agent.id }),
        expect.objectContaining({ type: "provider", id: provider.id }),
        expect.objectContaining({ type: "model", id: model.id }),
        expect.objectContaining({
          type: "conversation",
          id: conversation.id,
        }),
      ]),
    );

    await expect(
      executeResourceTransfer({
        actorUserId: ownerId,
        sourceWorkspaceId: secondProjectId,
        targetWorkspaceId: firstProjectId,
        resourceType: "agent",
        resourceId: agent.id,
        options: { ...options, secretPolicy: "keep" },
        confirmationToken: preview.confirmationToken,
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("preview changed"),
    });

    await executeResourceTransfer({
      actorUserId: ownerId,
      sourceWorkspaceId: secondProjectId,
      targetWorkspaceId: firstProjectId,
      resourceType: "agent",
      resourceId: agent.id,
      options,
      confirmationToken: preview.confirmationToken,
    });

    const [movedAgent] = await db
      .select({ workspaceId: agents.workspaceId })
      .from(agents)
      .where(eq(agents.id, agent.id));
    const [movedProvider] = await db
      .select({
        workspaceId: aiProviders.workspaceId,
        enabled: aiProviders.enabled,
        encryptedApiKey: aiProviders.encryptedApiKey,
      })
      .from(aiProviders)
      .where(eq(aiProviders.id, provider.id));
    const [movedConversation] = await db
      .select({ workspaceId: conversations.workspaceId })
      .from(conversations)
      .where(eq(conversations.id, conversation.id));
    expect(movedAgent.workspaceId).toBe(firstProjectId);
    expect(movedProvider).toMatchObject({
      workspaceId: firstProjectId,
      enabled: false,
      encryptedApiKey: null,
    });
    expect(movedConversation.workspaceId).toBe(firstProjectId);

    await db.delete(conversations).where(eq(conversations.id, conversation.id));
    await db.delete(agentVersions).where(eq(agentVersions.id, version.id));
    await db.delete(agents).where(eq(agents.id, agent.id));
    await db.delete(aiProviders).where(eq(aiProviders.id, provider.id));
  }, 60_000);

  it("clones a complete project configuration without moving the source", async () => {
    const cloneTarget = await createProject({
      userId: ownerId,
      workspaceId: firstProjectId,
      name: `Clone target ${suffix}`,
      slug: `clone-target-${suffix}`,
    });
    const [provider] = await db
      .insert(aiProviders)
      .values({
        workspaceId: secondProjectId,
        kind: "openai-compatible",
        name: `Clone provider ${suffix}`,
        authType: "bearer",
        encryptedApiKey: await encryptValue("clone-secret"),
        createdById: ownerId,
      })
      .returning();
    const [model] = await db
      .insert(aiModels)
      .values({
        providerId: provider.id,
        modelId: `clone-model-${suffix}`,
      })
      .returning();
    const [agent] = await db
      .insert(agents)
      .values({
        workspaceId: secondProjectId,
        name: `Clone assistant ${suffix}`,
        slug: `clone-assistant-${suffix}`,
        createdById: ownerId,
      })
      .returning();
    const [version] = await db
      .insert(agentVersions)
      .values({
        agentId: agent.id,
        versionNumber: 1,
        providerId: provider.id,
        modelId: model.id,
        createdById: ownerId,
      })
      .returning();
    await db
      .update(agents)
      .set({ activeVersionId: version.id })
      .where(eq(agents.id, agent.id));

    const [simulationSourceBefore, simulationTargetBefore] = await Promise.all([
      db
        .select({ id: agents.id, workspaceId: agents.workspaceId })
        .from(agents)
        .where(eq(agents.workspaceId, secondProjectId)),
      db
        .select({ id: agents.id, workspaceId: agents.workspaceId })
        .from(agents)
        .where(eq(agents.workspaceId, cloneTarget.id)),
    ]);
    const preview = await previewWorkspaceClone({
      actorUserId: ownerId,
      sourceWorkspaceId: secondProjectId,
      targetWorkspaceId: cloneTarget.id,
      secretPolicy: "disable",
    });
    const [simulationSourceAfter, simulationTargetAfter] = await Promise.all([
      db
        .select({ id: agents.id, workspaceId: agents.workspaceId })
        .from(agents)
        .where(eq(agents.workspaceId, secondProjectId)),
      db
        .select({ id: agents.id, workspaceId: agents.workspaceId })
        .from(agents)
        .where(eq(agents.workspaceId, cloneTarget.id)),
    ]);
    expect(simulationSourceAfter).toEqual(simulationSourceBefore);
    expect(simulationTargetAfter).toEqual(simulationTargetBefore);
    expect(preview.counts.providers).toBeGreaterThanOrEqual(1);
    expect(preview.counts.models).toBeGreaterThanOrEqual(1);
    expect(preview.counts.assistants).toBeGreaterThanOrEqual(1);
    await expect(
      executeWorkspaceClone({
        actorUserId: ownerId,
        sourceWorkspaceId: secondProjectId,
        targetWorkspaceId: cloneTarget.id,
        secretPolicy: "keep",
        confirmationToken: preview.confirmationToken,
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("changed"),
    });
    const targetAfterRejectedSimulation = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.workspaceId, cloneTarget.id));
    expect(targetAfterRejectedSimulation).toEqual(simulationTargetBefore);
    await executeWorkspaceClone({
      actorUserId: ownerId,
      sourceWorkspaceId: secondProjectId,
      targetWorkspaceId: cloneTarget.id,
      secretPolicy: "disable",
      confirmationToken: preview.confirmationToken,
    });

    const [sourceAgent] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, agent.id));
    const [clonedAgent] = await db
      .select()
      .from(agents)
      .where(
        and(
          eq(agents.workspaceId, cloneTarget.id),
          eq(agents.forkedFromAgentId, agent.id),
        ),
      );
    const [clonedProvider] = await db
      .select()
      .from(aiProviders)
      .where(
        and(
          eq(aiProviders.workspaceId, cloneTarget.id),
          eq(aiProviders.name, provider.name),
        ),
      );
    expect(sourceAgent.workspaceId).toBe(secondProjectId);
    expect(clonedAgent).toBeDefined();
    expect(clonedProvider).toMatchObject({
      enabled: false,
      encryptedApiKey: null,
    });

    const targetAgents = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.workspaceId, cloneTarget.id));
    if (targetAgents.length > 0) {
      await db.delete(agentVersions).where(
        inArray(
          agentVersions.agentId,
          targetAgents.map(({ id }) => id),
        ),
      );
    }
    await db.delete(workspaces).where(eq(workspaces.id, cloneTarget.id));
    await db.delete(agentVersions).where(eq(agentVersions.id, version.id));
    await db.delete(agents).where(eq(agents.id, agent.id));
    await db.delete(aiProviders).where(eq(aiProviders.id, provider.id));
  }, 60_000);

  it("previews and atomically adds or moves members in bulk", async () => {
    await addOrganizationMember({
      actorUserId: ownerId,
      workspaceId: firstProjectId,
      email: memberEmail,
    });
    const destination = await createOrganizationWithProject({
      userId: ownerId,
      organizationName: `Member transfer ${suffix}`,
      organizationSlug: `member-transfer-${suffix}`,
      projectName: "Destination",
      projectSlug: "destination",
    });
    const [destinationScope] = await db
      .select({ organizationId: workspaces.organizationId })
      .from(workspaces)
      .where(eq(workspaces.id, destination.id))
      .limit(1);
    organizationIds.push(destinationScope.organizationId);

    const [viewerRole, adminRole] = await Promise.all([
      db
        .select({ id: roles.id })
        .from(roles)
        .where(
          and(eq(roles.name, "workspace.viewer"), eq(roles.isSystem, true)),
        )
        .limit(1),
      db
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.name, "workspace.admin"), eq(roles.isSystem, true)))
        .limit(1),
    ]);
    const ownerMovePreview = await previewMemberTransfer({
      actorUserId: ownerId,
      sourceWorkspaceId: firstProjectId,
      targetWorkspaceId: destination.id,
      userIds: [ownerId],
      roleId: viewerRole[0].id,
      mode: "move",
    });
    expect(ownerMovePreview.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining("own account"),
        expect.stringContaining("last owner"),
      ]),
    );
    await assignRole({
      actorUserId: ownerId,
      workspaceId: firstProjectId,
      principalType: "user",
      principalId: memberId,
      roleId: viewerRole[0].id,
      scopeType: "workspace",
    });
    const sourceResourceRole = await createCustomRole({
      actorUserId: ownerId,
      workspaceId: firstProjectId,
      displayName: `Transfer resource reader ${suffix}`,
      scopeType: "workspace",
      permissions: ["agents.get"],
    });
    const [sourceAgent] = await db
      .insert(agents)
      .values({
        workspaceId: firstProjectId,
        name: `Transfer protected assistant ${suffix}`,
        slug: `transfer-protected-${suffix}`,
        createdById: ownerId,
      })
      .returning();
    await assignResourceRole({
      actorUserId: ownerId,
      workspaceId: firstProjectId,
      principalType: "user",
      principalId: memberId,
      roleId: sourceResourceRole.id,
      resourceType: "agent",
      resourceId: sourceAgent.id,
    });
    const sourceTeam = await createTeam({
      actorUserId: ownerId,
      workspaceId: firstProjectId,
      name: `Transfer team ${suffix}`,
    });
    await addTeamMember({
      actorUserId: ownerId,
      workspaceId: firstProjectId,
      teamId: sourceTeam.id,
      userId: memberId,
    });

    const destinations = await listMemberTransferDestinations({
      userId: ownerId,
      sourceWorkspaceId: firstProjectId,
    });
    expect(destinations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workspaceId: destination.id,
          crossOrganization: true,
        }),
      ]),
    );

    const addPreview = await previewMemberTransfer({
      actorUserId: ownerId,
      sourceWorkspaceId: firstProjectId,
      targetWorkspaceId: destination.id,
      userIds: [memberId, memberId],
      roleId: viewerRole[0].id,
      mode: "add",
    });
    expect(addPreview).toMatchObject({
      blockers: [],
      changes: {
        destinationMembershipsAdded: 1,
        destinationAssignmentsAdded: 1,
        sourceAssignmentsRemoved: 0,
        sourceTeamMembershipsRemoved: 0,
      },
    });
    await executeMemberTransfer({
      actorUserId: ownerId,
      sourceWorkspaceId: firstProjectId,
      targetWorkspaceId: destination.id,
      userIds: [memberId],
      roleId: viewerRole[0].id,
      mode: "add",
      confirmationToken: addPreview.confirmationToken,
    });
    expect(
      await authorization.hasPermission(
        { principalType: "user", principalId: memberId },
        "workspaces.get",
        "workspace",
        firstProjectId,
      ),
    ).toBe(true);
    expect(
      await authorization.hasPermission(
        { principalType: "user", principalId: memberId },
        "workspaces.get",
        "workspace",
        destination.id,
      ),
    ).toBe(true);

    const stalePreview = await previewMemberTransfer({
      actorUserId: ownerId,
      sourceWorkspaceId: firstProjectId,
      targetWorkspaceId: destination.id,
      userIds: [memberId],
      roleId: viewerRole[0].id,
      mode: "move",
    });
    await assignRole({
      actorUserId: ownerId,
      workspaceId: firstProjectId,
      principalType: "user",
      principalId: memberId,
      roleId: adminRole[0].id,
      scopeType: "workspace",
    });
    await expect(
      executeMemberTransfer({
        actorUserId: ownerId,
        sourceWorkspaceId: firstProjectId,
        targetWorkspaceId: destination.id,
        userIds: [memberId],
        roleId: viewerRole[0].id,
        mode: "move",
        confirmationToken: stalePreview.confirmationToken,
      }),
    ).rejects.toMatchObject({ status: 409 });

    const movePreview = await previewMemberTransfer({
      actorUserId: ownerId,
      sourceWorkspaceId: firstProjectId,
      targetWorkspaceId: destination.id,
      userIds: [memberId],
      roleId: viewerRole[0].id,
      mode: "move",
    });
    expect(movePreview.changes).toMatchObject({
      sourceAssignmentsRemoved: 4,
      sourceTeamMembershipsRemoved: 1,
    });
    await executeMemberTransfer({
      actorUserId: ownerId,
      sourceWorkspaceId: firstProjectId,
      targetWorkspaceId: destination.id,
      userIds: [memberId],
      roleId: viewerRole[0].id,
      mode: "move",
      confirmationToken: movePreview.confirmationToken,
    });

    const [
      sourceMembership,
      destinationMembership,
      remainingTeamMembership,
      remainingResourceAccess,
    ] = await Promise.all([
      db
        .select({ status: organizationMembers.status })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, organizationId),
            eq(organizationMembers.userId, memberId),
          ),
        )
        .limit(1),
      db
        .select({ status: organizationMembers.status })
        .from(organizationMembers)
        .where(
          and(
            eq(
              organizationMembers.organizationId,
              destinationScope.organizationId,
            ),
            eq(organizationMembers.userId, memberId),
          ),
        )
        .limit(1),
      db
        .select({ id: teamMembers.id })
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, sourceTeam.id),
            eq(teamMembers.userId, memberId),
          ),
        ),
      db
        .select({ id: roleBindings.id })
        .from(roleBindings)
        .where(
          and(
            eq(roleBindings.principalType, "user"),
            eq(roleBindings.principalId, memberId),
            eq(roleBindings.resourceType, "agent"),
            eq(roleBindings.resourceId, sourceAgent.id),
          ),
        ),
    ]);
    expect(sourceMembership[0]?.status).toBe("removed");
    expect(destinationMembership[0]?.status).toBe("active");
    expect(remainingTeamMembership).toEqual([]);
    expect(remainingResourceAccess).toEqual([]);
  }, 60_000);

  it("continues the latest assistant response in place in PostgreSQL", async () => {
    const conversationId = randomUUID();
    const userMessageId = randomUUID();
    const assistantMessageId = randomUUID();
    const laterUserMessageId = randomUUID();

    try {
      await db.insert(conversations).values({
        id: conversationId,
        workspaceId: secondProjectId,
        agentId: sharedAgentId,
        userId: ownerId,
        title: "Continuation persistence",
      });
      await db.insert(messages).values([
        {
          id: userMessageId,
          conversationId,
          role: "user",
          status: "completed",
          completedAt: new Date(),
          createdAt: new Date(Date.now() - 1_000),
        },
        {
          id: assistantMessageId,
          conversationId,
          role: "assistant",
          status: "completed",
          tokenInput: 10,
          tokenOutput: 20,
          completedAt: new Date(),
        },
      ]);
      await db.insert(messageParts).values([
        {
          messageId: userMessageId,
          type: "text",
          contentEncrypted: await encryptValue("Explain the result."),
          sortOrder: 0,
        },
        {
          messageId: assistantMessageId,
          type: "text",
          contentEncrypted: await encryptValue("First half."),
          sortOrder: 0,
        },
        {
          messageId: assistantMessageId,
          type: "suggestions",
          contentEncrypted: await encryptValue('["Ask more"]'),
          sortOrder: 1,
        },
      ]);

      const claim = await claimAssistantContinuation({
        conversationId,
        messageId: assistantMessageId,
        providerId: null,
        modelId: "continuation-test-model",
      });

      expect(claim).toMatchObject({
        status: "claimed",
        message: {
          id: assistantMessageId,
          status: "streaming",
          tokenInput: 10,
          tokenOutput: 20,
        },
        nextSortOrder: 1,
        appendableTextPart: { content: "First half." },
      });
      const persistedMessages = await db
        .select({ id: messages.id, role: messages.role })
        .from(messages)
        .where(eq(messages.conversationId, conversationId));
      expect(persistedMessages).toHaveLength(2);
      expect(
        persistedMessages.filter((message) => message.role === "assistant"),
      ).toEqual([{ id: assistantMessageId, role: "assistant" }]);

      const persistedParts = await db
        .select({ type: messageParts.type })
        .from(messageParts)
        .where(eq(messageParts.messageId, assistantMessageId));
      expect(persistedParts).toEqual([{ type: "text" }]);

      await expect(
        claimAssistantContinuation({
          conversationId,
          messageId: assistantMessageId,
          providerId: null,
          modelId: "continuation-test-model",
        }),
      ).resolves.toEqual({ status: "already_streaming" });
      await expect(
        claimAssistantContinuation({
          conversationId,
          messageId: randomUUID(),
          providerId: null,
          modelId: "continuation-test-model",
        }),
      ).resolves.toEqual({ status: "not_found" });

      await db.insert(messages).values({
        id: laterUserMessageId,
        conversationId,
        role: "user",
        status: "completed",
        completedAt: new Date(),
        createdAt: new Date(Date.now() + 1_000),
      });
      await expect(
        claimAssistantContinuation({
          conversationId,
          messageId: assistantMessageId,
          providerId: null,
          modelId: "continuation-test-model",
        }),
      ).resolves.toEqual({ status: "not_latest" });
    } finally {
      await db
        .delete(messageParts)
        .where(
          inArray(messageParts.messageId, [
            userMessageId,
            assistantMessageId,
            laterUserMessageId,
          ]),
        );
      await db
        .delete(messages)
        .where(eq(messages.conversationId, conversationId));
      await db
        .delete(conversations)
        .where(eq(conversations.id, conversationId));
    }
  }, 60_000);

  it("clones and then moves a complete organization atomically", async () => {
    const sourceProject = await createOrganizationWithProject({
      userId: ownerId,
      organizationName: `Migration source ${suffix}`,
      organizationSlug: `migration-source-${suffix}`,
      projectName: "Source project",
      projectSlug: "source-project",
    });
    const targetProject = await createOrganizationWithProject({
      userId: ownerId,
      organizationName: `Migration target ${suffix}`,
      organizationSlug: `migration-target-${suffix}`,
      projectName: "Target project",
      projectSlug: "target-project",
    });
    const [sourceScope, targetScope] = await Promise.all([
      db
        .select({ organizationId: workspaces.organizationId })
        .from(workspaces)
        .where(eq(workspaces.id, sourceProject.id))
        .then((rows) => rows[0]),
      db
        .select({ organizationId: workspaces.organizationId })
        .from(workspaces)
        .where(eq(workspaces.id, targetProject.id))
        .then((rows) => rows[0]),
    ]);
    organizationIds.push(
      sourceScope.organizationId,
      targetScope.organizationId,
    );
    const conflictingSourceProject = await createProject({
      userId: ownerId,
      workspaceId: sourceProject.id,
      name: "Conflicting source project",
      slug: "target-project",
    });

    const [sourceProjectsBeforeSimulation, targetProjectsBeforeSimulation] =
      await Promise.all([
        db
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.organizationId, sourceScope.organizationId)),
        db
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.organizationId, targetScope.organizationId)),
      ]);
    const clonePreview = await previewOrganizationClone({
      actorUserId: ownerId,
      sourceWorkspaceId: sourceProject.id,
      targetOrganizationId: targetScope.organizationId,
      secretPolicy: "disable",
    });
    const [sourceProjectsAfterSimulation, targetProjectsAfterSimulation] =
      await Promise.all([
        db
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.organizationId, sourceScope.organizationId)),
        db
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.organizationId, targetScope.organizationId)),
      ]);
    expect(sourceProjectsAfterSimulation).toEqual(
      sourceProjectsBeforeSimulation,
    );
    expect(targetProjectsAfterSimulation).toEqual(
      targetProjectsBeforeSimulation,
    );
    expect(clonePreview.counts.projects).toBe(2);
    expect(clonePreview.conflictResolutions).toEqual([]);
    await executeOrganizationClone({
      actorUserId: ownerId,
      sourceWorkspaceId: sourceProject.id,
      targetOrganizationId: targetScope.organizationId,
      secretPolicy: "disable",
      confirmationToken: clonePreview.confirmationToken,
    });
    const clonedProjects = await db
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.organizationId, targetScope.organizationId));
    expect(clonedProjects.map(({ name }) => name)).toContain(
      "Source project (copy)",
    );

    const movePreview = await previewOrganizationTransfer({
      actorUserId: ownerId,
      sourceWorkspaceId: sourceProject.id,
      targetOrganizationId: targetScope.organizationId,
    });
    expect(movePreview.blockers).toEqual([]);
    expect(movePreview.conflictResolutions).toContainEqual({
      resourceType: "project",
      resourceId: conflictingSourceProject.id,
      label: "Conflicting source project",
      from: "target-project",
      to: "target-project-2",
    });
    await executeOrganizationTransfer({
      actorUserId: ownerId,
      sourceWorkspaceId: sourceProject.id,
      targetOrganizationId: targetScope.organizationId,
      confirmationToken: movePreview.confirmationToken,
    });
    const remainingSourceProjects = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.organizationId, sourceScope.organizationId));
    const [movedSourceProject, renamedConflictingProject] = await Promise.all([
      db
        .select({ organizationId: workspaces.organizationId })
        .from(workspaces)
        .where(eq(workspaces.id, sourceProject.id))
        .then((rows) => rows[0]),
      db
        .select({ slug: workspaces.slug })
        .from(workspaces)
        .where(eq(workspaces.id, conflictingSourceProject.id))
        .then((rows) => rows[0]),
    ]);
    expect(remainingSourceProjects).toHaveLength(0);
    expect(movedSourceProject.organizationId).toBe(targetScope.organizationId);
    expect(renamedConflictingProject.slug).toBe("target-project-2");
  }, 60_000);

  it("renames and permanently deletes projects and organizations safely", async () => {
    const lifecycleProject = await createOrganizationWithProject({
      userId: ownerId,
      organizationName: `Lifecycle source ${suffix}`,
      organizationSlug: `lifecycle-source-${suffix}`,
      projectName: "Lifecycle main",
      projectSlug: "lifecycle-main",
    });
    const removableProject = await createProject({
      userId: ownerId,
      workspaceId: lifecycleProject.id,
      name: "Removable project",
      slug: "removable-project",
    });
    const fallbackProject = await createOrganizationWithProject({
      userId: ownerId,
      organizationName: `Lifecycle fallback ${suffix}`,
      organizationSlug: `lifecycle-fallback-${suffix}`,
      projectName: "Fallback project",
      projectSlug: "fallback-project",
    });
    const [lifecycleScope, fallbackScope] = await Promise.all([
      db
        .select({ organizationId: workspaces.organizationId })
        .from(workspaces)
        .where(eq(workspaces.id, lifecycleProject.id))
        .then((rows) => rows[0]),
      db
        .select({ organizationId: workspaces.organizationId })
        .from(workspaces)
        .where(eq(workspaces.id, fallbackProject.id))
        .then((rows) => rows[0]),
    ]);
    organizationIds.push(
      lifecycleScope.organizationId,
      fallbackScope.organizationId,
    );

    await renameOrganization({
      actorUserId: ownerId,
      workspaceId: lifecycleProject.id,
      name: "Renamed organization",
      slug: `renamed-organization-${suffix}`,
    });
    await renameProject({
      actorUserId: ownerId,
      workspaceId: removableProject.id,
      name: "Renamed removable project",
      slug: "renamed-removable-project",
    });
    const removableRole = await createCustomRole({
      actorUserId: ownerId,
      workspaceId: removableProject.id,
      displayName: "Removable project role",
      scopeType: "workspace",
      permissions: ["agents.get"],
    });
    const [removableAgent] = await db
      .insert(agents)
      .values({
        workspaceId: removableProject.id,
        name: "Removable project assistant",
        slug: `removable-project-assistant-${suffix}`,
        createdById: ownerId,
      })
      .returning();
    await assignResourceRole({
      actorUserId: ownerId,
      workspaceId: removableProject.id,
      principalType: "user",
      principalId: ownerId,
      roleId: removableRole.id,
      resourceType: "agent",
      resourceId: removableAgent.id,
    });
    await expect(
      deleteProject({
        actorUserId: ownerId,
        workspaceId: removableProject.id,
        confirmationName: "wrong name",
      }),
    ).rejects.toMatchObject({ status: 400 });
    const projectDeletion = await deleteProject({
      actorUserId: ownerId,
      workspaceId: removableProject.id,
      confirmationName: "Renamed removable project",
    });
    expect(projectDeletion.nextWorkspaceId).toBe(lifecycleProject.id);
    expect(
      await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.id, removableProject.id)),
    ).toEqual([]);
    expect(
      await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.id, removableRole.id)),
    ).toEqual([]);
    expect(
      await db
        .select({ id: roleBindings.id })
        .from(roleBindings)
        .where(eq(roleBindings.resourceId, removableAgent.id)),
    ).toEqual([]);

    const organizationTeam = await createTeam({
      actorUserId: ownerId,
      workspaceId: lifecycleProject.id,
      name: "Removable organization team",
    });
    const organizationRole = await createCustomRole({
      actorUserId: ownerId,
      workspaceId: lifecycleProject.id,
      displayName: "Removable organization role",
      scopeType: "organization",
      permissions: ["organization.get"],
    });
    await assignRole({
      actorUserId: ownerId,
      workspaceId: lifecycleProject.id,
      principalType: "user",
      principalId: ownerId,
      roleId: organizationRole.id,
      scopeType: "organization",
    });

    const organizationDeletion = await deleteOrganization({
      actorUserId: ownerId,
      workspaceId: lifecycleProject.id,
      confirmationName: "Renamed organization",
    });
    expect(organizationDeletion.nextWorkspaceId).toBeTruthy();
    const [fallbackAfterDeletion] = await db
      .select({ organizationId: workspaces.organizationId })
      .from(workspaces)
      .where(eq(workspaces.id, organizationDeletion.nextWorkspaceId!));
    expect(fallbackAfterDeletion.organizationId).not.toBe(
      lifecycleScope.organizationId,
    );
    expect(
      await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, lifecycleScope.organizationId)),
    ).toEqual([]);
    expect(
      await db
        .select({ id: teams.id })
        .from(teams)
        .where(eq(teams.id, organizationTeam.id)),
    ).toEqual([]);
    expect(
      await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.id, organizationRole.id)),
    ).toEqual([]);

    const onlyProject = await createOrganizationWithProject({
      userId: outsiderId,
      organizationName: `Only organization ${suffix}`,
      organizationSlug: `only-organization-${suffix}`,
      projectName: "Only project",
      projectSlug: "only-project",
    });
    const [onlyScope] = await db
      .select({ organizationId: workspaces.organizationId })
      .from(workspaces)
      .where(eq(workspaces.id, onlyProject.id));
    organizationIds.push(onlyScope.organizationId);
    await expect(
      deleteOrganization({
        actorUserId: outsiderId,
        workspaceId: onlyProject.id,
        confirmationName: `Only organization ${suffix}`,
      }),
    ).resolves.toEqual({ nextWorkspaceId: null });
  }, 60_000);

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
  }, 60_000);
});
