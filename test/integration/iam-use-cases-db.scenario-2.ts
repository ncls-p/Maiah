
import { eq } from "drizzle-orm";
import { expect } from "vitest";

import { encryptValue } from "@/lib/crypto";
import { executeResourceTransfer,listResourceTransferDestinations,previewResourceTransfer } from "@/modules/iam/resource-transfer";
import { db } from "@/server/infrastructure/db";
import { agents,agentVersions,aiModels,aiProviders,conversations } from "@/server/infrastructure/db/schema";
import type { IamDatabaseScenarioContext } from "./iam-use-cases-db.context";

export async function runIamDatabaseScenario2(context: IamDatabaseScenarioContext) {
  const { suffix, ownerId } = context;
  const { firstProjectId, secondProjectId } = context;
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
    await db.update(agents).set({ activeVersionId: version.id }).where(eq(agents.id, agent.id));
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
    expect(destinations).toEqual(expect.arrayContaining([expect.objectContaining({ workspaceId: firstProjectId })]));

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
    expect(blockedPreview.blockers).toEqual([expect.stringContaining("linked resource")]);

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

    const [movedAgent] = await db.select({ workspaceId: agents.workspaceId }).from(agents).where(eq(agents.id, agent.id));
    const [movedProvider] = await db
      .select({
        workspaceId: aiProviders.workspaceId,
        enabled: aiProviders.enabled,
        encryptedApiKey: aiProviders.encryptedApiKey,
      })
      .from(aiProviders)
      .where(eq(aiProviders.id, provider.id));
    const [movedConversation] = await db.select({ workspaceId: conversations.workspaceId }).from(conversations).where(eq(conversations.id, conversation.id));
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
  
}
