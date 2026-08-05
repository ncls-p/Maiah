
import { and,eq,inArray } from "drizzle-orm";
import { expect } from "vitest";

import { encryptValue } from "@/lib/crypto";
import { createProject } from "@/modules/iam/use-cases";
import { executeWorkspaceClone,previewWorkspaceClone } from "@/modules/iam/workspace-clone";
import { db } from "@/server/infrastructure/db";
import { agents,agentVersions,aiModels,aiProviders,workspaces } from "@/server/infrastructure/db/schema";
import type { IamDatabaseScenarioContext } from "./iam-use-cases-db.context";

export async function runIamDatabaseScenario3(context: IamDatabaseScenarioContext) {
  const { suffix, ownerId } = context;
  const { firstProjectId, secondProjectId } = context;
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
    await db.update(agents).set({ activeVersionId: version.id }).where(eq(agents.id, agent.id));

    const [simulationSourceBefore, simulationTargetBefore] = await Promise.all([db.select({ id: agents.id, workspaceId: agents.workspaceId }).from(agents).where(eq(agents.workspaceId, secondProjectId)), db.select({ id: agents.id, workspaceId: agents.workspaceId }).from(agents).where(eq(agents.workspaceId, cloneTarget.id))]);
    const preview = await previewWorkspaceClone({
      actorUserId: ownerId,
      sourceWorkspaceId: secondProjectId,
      targetWorkspaceId: cloneTarget.id,
      secretPolicy: "disable",
    });
    const [simulationSourceAfter, simulationTargetAfter] = await Promise.all([db.select({ id: agents.id, workspaceId: agents.workspaceId }).from(agents).where(eq(agents.workspaceId, secondProjectId)), db.select({ id: agents.id, workspaceId: agents.workspaceId }).from(agents).where(eq(agents.workspaceId, cloneTarget.id))]);
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
    const targetAfterRejectedSimulation = await db.select({ id: agents.id }).from(agents).where(eq(agents.workspaceId, cloneTarget.id));
    expect(targetAfterRejectedSimulation).toEqual(simulationTargetBefore);
    await executeWorkspaceClone({
      actorUserId: ownerId,
      sourceWorkspaceId: secondProjectId,
      targetWorkspaceId: cloneTarget.id,
      secretPolicy: "disable",
      confirmationToken: preview.confirmationToken,
    });

    const [sourceAgent] = await db.select().from(agents).where(eq(agents.id, agent.id));
    const [clonedAgent] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.workspaceId, cloneTarget.id), eq(agents.forkedFromAgentId, agent.id)));
    const [clonedProvider] = await db
      .select()
      .from(aiProviders)
      .where(and(eq(aiProviders.workspaceId, cloneTarget.id), eq(aiProviders.name, provider.name)));
    expect(sourceAgent.workspaceId).toBe(secondProjectId);
    expect(clonedAgent).toBeDefined();
    expect(clonedProvider).toMatchObject({
      enabled: false,
      encryptedApiKey: null,
    });

    const targetAgents = await db.select({ id: agents.id }).from(agents).where(eq(agents.workspaceId, cloneTarget.id));
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
  
}
