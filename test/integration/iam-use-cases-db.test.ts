import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { encryptValue } from "@/lib/crypto";
import { claimAssistantContinuation } from "@/modules/chat/continuation";
import {
  executeResourceTransfer,
  listResourceTransferDestinations,
  previewResourceTransfer,
} from "@/modules/iam/resource-transfer";
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
  roleBindings,
  roles,
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
      permissions: ["agents.view", "workflows.view"],
    });
    const resourceRole = await createCustomRole({
      actorUserId: ownerId,
      workspaceId: secondProjectId,
      displayName: "Assistant Reader",
      description: "Read one selected assistant",
      scopeType: "workspace",
      permissions: ["agents.view"],
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
    sharedAgentId = sharedAgent.id;
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
