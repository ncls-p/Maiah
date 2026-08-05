import { and, eq, inArray } from "drizzle-orm";

import type { AccessResourceType } from "@/server/domain/entities/access-resource";
import { db } from "@/server/infrastructure/db";
import { agentRuns, agentSkills, agents, aiProviders, conversations, customToolCredentialRefs, customToolSecretRequests, customTools, documents, knowledgeBases, marketplaceItems, mcpServers, organizationMembers, roleBindings, roles, scheduledTasks, toolConnectionRequirements, toolConnections, toolConnectors, toolInvocations, userAgentPreferences, userToolSettings, workflowAgentInputRequests, workflowAgentMessages, workflowAgentRunRequests, workflowAgentTodoLists, workflowRuns, workflows, workspaceMembers } from "@/server/infrastructure/db/schema";

import type { ResourceTransferExecutionInput } from "./resource-transfer.execute-resource-transfer";
import type { previewResourceTransfer } from "./resource-transfer.preview-resource-transfer";

type TransferPreview = Awaited<ReturnType<typeof previewResourceTransfer>>;

export async function applyResourceTransferTransaction(context: { input: ResourceTransferExecutionInput; preview: TransferPreview; assignmentIdsToRemove: string[]; now: Date; targetWorkspaceId: string; crossOrganization: boolean; byType: (type: AccessResourceType) => string[]; workspaceBindings: Array<typeof roleBindings.$inferSelect>; transferableWorkspaceBindings: Array<typeof roleBindings.$inferSelect>; projectMemberRows: Array<{ userId: string }>; organizationMemberRole?: { id: string }; workspaceMemberRole?: { id: string } }) {
  const { input, preview, assignmentIdsToRemove, now, targetWorkspaceId, crossOrganization, byType, workspaceBindings, transferableWorkspaceBindings, projectMemberRows, organizationMemberRole, workspaceMemberRole } = context;
  await db.transaction(async (tx) => {
    if (assignmentIdsToRemove.length > 0) {
      await tx.delete(roleBindings).where(inArray(roleBindings.id, assignmentIdsToRemove));
    }
    const agentIds = byType("agent");
    const providerIds = byType("provider");
    const mcpIds = byType("mcp_server");
    const connectorIds = byType("tool_connector");
    const connectionIds = byType("tool_connection");
    const customIds = byType("custom_tool");
    const knowledgeIds = byType("knowledge_base");
    const skillIds = byType("skill");
    const workflowIds = byType("workflow");
    const taskIds = byType("scheduled_task");
    const conversationIds = byType("conversation");
    const marketplaceIds = byType("marketplace_item");

    if (input.resourceType === "workspace") {
      await tx
        .update(roles)
        .set({ ownerResourceId: targetWorkspaceId, updatedAt: now })
        .where(and(eq(roles.isSystem, false), eq(roles.ownerResourceType, "workspace"), eq(roles.ownerResourceId, input.sourceWorkspaceId)));
      if (transferableWorkspaceBindings.length > 0) {
        await tx
          .insert(roleBindings)
          .values(
            transferableWorkspaceBindings.map((binding) => ({
              principalType: binding.principalType,
              principalId: binding.principalId,
              roleId: binding.roleId,
              resourceType: "workspace" as const,
              resourceId: targetWorkspaceId,
              conditionJson: binding.conditionJson,
              expiresAt: binding.expiresAt,
              createdById: binding.createdById,
            })),
          )
          .onConflictDoNothing();
      }
      if (workspaceBindings.length > 0) {
        await tx.delete(roleBindings).where(
          inArray(
            roleBindings.id,
            workspaceBindings.map(({ id }) => id),
          ),
        );
      }
      for (const { userId } of projectMemberRows) {
        if (crossOrganization) {
          await tx
            .insert(organizationMembers)
            .values({
              organizationId: preview.destination.organizationId,
              userId,
              status: "active",
            })
            .onConflictDoUpdate({
              target: [organizationMembers.organizationId, organizationMembers.userId],
              set: { status: "active", updatedAt: now },
            });
          await tx
            .insert(roleBindings)
            .values({
              principalType: "user",
              principalId: userId,
              roleId: organizationMemberRole!.id,
              resourceType: "organization",
              resourceId: preview.destination.organizationId,
              createdById: input.actorUserId,
            })
            .onConflictDoNothing();
        }
        await tx
          .insert(workspaceMembers)
          .values({ workspaceId: targetWorkspaceId, userId, status: "active" })
          .onConflictDoUpdate({
            target: [workspaceMembers.workspaceId, workspaceMembers.userId],
            set: { status: "active", updatedAt: now },
          });
        await tx
          .insert(roleBindings)
          .values({
            principalType: "user",
            principalId: userId,
            roleId: workspaceMemberRole!.id,
            resourceType: "workspace",
            resourceId: targetWorkspaceId,
            createdById: input.actorUserId,
          })
          .onConflictDoNothing();
      }
      if (projectMemberRows.length > 0) {
        await tx
          .update(workspaceMembers)
          .set({ status: "removed", updatedAt: now })
          .where(
            and(
              eq(workspaceMembers.workspaceId, input.sourceWorkspaceId),
              inArray(
                workspaceMembers.userId,
                projectMemberRows.map(({ userId }) => userId),
              ),
            ),
          );
      }
    }

    if (conversationIds.length > 0) {
      await tx
        .update(conversations)
        .set({
          workspaceId: targetWorkspaceId,
          folderId: null,
          updatedAt: now,
          ...(crossOrganization && input.options.ownershipPolicy === "actor" ? { userId: input.actorUserId } : {}),
        })
        .where(inArray(conversations.id, conversationIds));
      await tx.update(toolInvocations).set({ workspaceId: targetWorkspaceId }).where(inArray(toolInvocations.conversationId, conversationIds));
    }
    if (agentIds.length > 0) {
      await tx
        .update(agents)
        .set({
          workspaceId: targetWorkspaceId,
          updatedAt: now,
          ...(crossOrganization && input.options.ownershipPolicy === "actor" ? { createdById: input.actorUserId } : {}),
        })
        .where(inArray(agents.id, agentIds));
      await tx.update(agentRuns).set({ workspaceId: targetWorkspaceId, updatedAt: now }).where(inArray(agentRuns.agentId, agentIds));
      await tx.delete(userAgentPreferences).where(inArray(userAgentPreferences.defaultAgentId, agentIds));
    }
    if (providerIds.length > 0) {
      await tx
        .update(aiProviders)
        .set({
          workspaceId: targetWorkspaceId,
          updatedAt: now,
          ...(crossOrganization && input.options.ownershipPolicy === "actor" ? { createdById: input.actorUserId } : {}),
          ...(input.options.secretPolicy === "disable"
            ? {
                enabled: false,
                encryptedApiKey: null,
                encryptedHeadersJson: null,
                healthStatus: null,
              }
            : {}),
        })
        .where(inArray(aiProviders.id, providerIds));
    }
    if (mcpIds.length > 0) {
      await tx
        .update(mcpServers)
        .set({
          workspaceId: targetWorkspaceId,
          updatedAt: now,
          ...(crossOrganization && input.options.ownershipPolicy === "actor" ? { createdById: input.actorUserId } : {}),
          ...(input.options.secretPolicy === "disable"
            ? {
                enabled: false,
                encryptedHeadersJson: null,
                encryptedEnvJson: null,
                healthStatus: null,
              }
            : {}),
        })
        .where(inArray(mcpServers.id, mcpIds));
    }
    if (connectorIds.length > 0) {
      await tx
        .update(toolConnectors)
        .set({
          workspaceId: targetWorkspaceId,
          updatedAt: now,
          ...(crossOrganization && input.options.ownershipPolicy === "actor" ? { createdById: input.actorUserId } : {}),
        })
        .where(inArray(toolConnectors.id, connectorIds));
      await tx.update(toolConnectionRequirements).set({ workspaceId: targetWorkspaceId, updatedAt: now }).where(inArray(toolConnectionRequirements.connectorId, connectorIds));
    }
    if (connectionIds.length > 0) {
      await tx
        .update(toolConnections)
        .set({
          workspaceId: targetWorkspaceId,
          updatedAt: now,
          ...(crossOrganization && input.options.ownershipPolicy === "actor" ? { ownerType: "workspace", ownerUserId: null } : {}),
          ...(input.options.secretPolicy === "disable"
            ? {
                encryptedSecretsJson: null,
                status: "invalid" as const,
                lastValidatedAt: null,
              }
            : {}),
        })
        .where(inArray(toolConnections.id, connectionIds));
      await tx.update(userToolSettings).set({ workspaceId: targetWorkspaceId, updatedAt: now }).where(inArray(userToolSettings.connectionId, connectionIds));
    }
    if (customIds.length > 0) {
      await tx
        .update(customTools)
        .set({
          workspaceId: targetWorkspaceId,
          updatedAt: now,
          ...(crossOrganization && input.options.ownershipPolicy === "actor" ? { createdById: input.actorUserId } : {}),
        })
        .where(inArray(customTools.id, customIds));
      const secretRequests = await tx.select({ credentialId: customToolSecretRequests.credentialRefId }).from(customToolSecretRequests).where(inArray(customToolSecretRequests.customToolId, customIds));
      await tx
        .update(customToolSecretRequests)
        .set({
          workspaceId: targetWorkspaceId,
          ...(crossOrganization && input.options.ownershipPolicy === "actor" ? { userId: input.actorUserId } : {}),
        })
        .where(inArray(customToolSecretRequests.customToolId, customIds));
      const credentialIds = secretRequests.map(({ credentialId }) => credentialId).filter((id): id is string => Boolean(id));
      if (credentialIds.length > 0) {
        await tx
          .update(customToolCredentialRefs)
          .set({
            workspaceId: targetWorkspaceId,
            ...(crossOrganization && input.options.ownershipPolicy === "actor" ? { userId: input.actorUserId } : {}),
          })
          .where(inArray(customToolCredentialRefs.id, credentialIds));
      }
    }
    if (knowledgeIds.length > 0) {
      await tx
        .update(knowledgeBases)
        .set({
          workspaceId: targetWorkspaceId,
          updatedAt: now,
          ...(crossOrganization && input.options.ownershipPolicy === "actor" ? { createdById: input.actorUserId } : {}),
        })
        .where(inArray(knowledgeBases.id, knowledgeIds));
      await tx
        .update(documents)
        .set({
          workspaceId: targetWorkspaceId,
          updatedAt: now,
          ...(crossOrganization && input.options.ownershipPolicy === "actor" ? { createdById: input.actorUserId } : {}),
        })
        .where(inArray(documents.knowledgeBaseId, knowledgeIds));
    }
    if (skillIds.length > 0) {
      await tx
        .update(agentSkills)
        .set({
          workspaceId: targetWorkspaceId,
          updatedAt: now,
          ...(crossOrganization && input.options.ownershipPolicy === "actor" ? { createdById: input.actorUserId } : {}),
        })
        .where(inArray(agentSkills.id, skillIds));
    }
    if (workflowIds.length > 0) {
      await tx
        .update(workflows)
        .set({
          workspaceId: targetWorkspaceId,
          updatedAt: now,
          ...(crossOrganization && input.options.ownershipPolicy === "actor" ? { createdById: input.actorUserId } : {}),
        })
        .where(inArray(workflows.id, workflowIds));
      await tx.update(workflowRuns).set({ workspaceId: targetWorkspaceId }).where(inArray(workflowRuns.workflowId, workflowIds));
      for (const table of [workflowAgentMessages, workflowAgentInputRequests, workflowAgentRunRequests, workflowAgentTodoLists]) {
        await tx.update(table).set({ workspaceId: targetWorkspaceId }).where(inArray(table.workflowId, workflowIds));
      }
    }
    if (taskIds.length > 0) {
      await tx
        .update(scheduledTasks)
        .set({
          workspaceId: targetWorkspaceId,
          updatedAt: now,
          ...(crossOrganization && input.options.ownershipPolicy === "actor" ? { userId: input.actorUserId } : {}),
        })
        .where(inArray(scheduledTasks.id, taskIds));
    }
    if (marketplaceIds.length > 0) {
      await tx.update(marketplaceItems).set({ publisherWorkspaceId: targetWorkspaceId, updatedAt: now }).where(inArray(marketplaceItems.id, marketplaceIds));
    }
  });
}
