import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/infrastructure/db";
import {
  agents,
  agentVersions,
  aiModels,
  aiProviders,
  appSettings,
} from "@/server/infrastructure/db/schema";

const WORKFLOW_BUILDER_SETTING_PREFIX = "workflowBuilder:";

const workflowBuilderConfigSchema = z.object({
  agentId: z.uuid().nullable().default(null),
});

export type WorkflowBuilderConfig = z.infer<typeof workflowBuilderConfigSchema>;

function settingKey(workspaceId: string) {
  return `${WORKFLOW_BUILDER_SETTING_PREFIX}${workspaceId}`;
}

function parseConfig(value: unknown): WorkflowBuilderConfig {
  const parsed = workflowBuilderConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : { agentId: null };
}

export async function getWorkflowBuilderConfig(
  workspaceId: string,
): Promise<WorkflowBuilderConfig> {
  const [row] = await db
    .select({ valueJson: appSettings.valueJson })
    .from(appSettings)
    .where(eq(appSettings.key, settingKey(workspaceId)))
    .limit(1);

  return parseConfig(row?.valueJson);
}

export async function getConfiguredWorkflowBuilderAgentId(workspaceId: string) {
  return (await getWorkflowBuilderConfig(workspaceId)).agentId;
}

async function listWorkflowBuilderAgents(workspaceId: string) {
  const rows = await db
    .select({
      id: agents.id,
      name: agents.name,
      description: agents.description,
      activeVersionId: agents.activeVersionId,
      providerId: agentVersions.providerId,
      modelId: agentVersions.modelId,
      providerName: aiProviders.name,
      providerEnabled: aiProviders.enabled,
      providerArchivedAt: aiProviders.archivedAt,
      modelDisplayName: aiModels.displayName,
      modelTechnicalId: aiModels.modelId,
      modelEnabled: aiModels.enabled,
      modelCapabilities: aiModels.capabilitiesJson,
    })
    .from(agents)
    .leftJoin(agentVersions, eq(agents.activeVersionId, agentVersions.id))
    .leftJoin(aiProviders, eq(agentVersions.providerId, aiProviders.id))
    .leftJoin(
      aiModels,
      and(
        eq(agentVersions.modelId, aiModels.id),
        eq(aiModels.providerId, aiProviders.id),
      ),
    )
    .where(and(eq(agents.workspaceId, workspaceId), isNull(agents.archivedAt)))
    .orderBy(asc(agents.name));

  return rows.map((row) => {
    const capabilities =
      row.modelCapabilities &&
      typeof row.modelCapabilities === "object" &&
      !Array.isArray(row.modelCapabilities)
        ? (row.modelCapabilities as Record<string, unknown>)
        : null;
    const supportsTools = capabilities?.tools !== false;
    const ready = Boolean(
      row.activeVersionId &&
      row.providerId &&
      row.modelId &&
      row.providerEnabled &&
      !row.providerArchivedAt &&
      row.modelEnabled &&
      supportsTools,
    );

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      providerName: row.providerName,
      modelDisplayName: row.modelDisplayName ?? row.modelTechnicalId,
      supportsTools,
      ready,
    };
  });
}

export async function getWorkflowBuilderAdminState(workspaceId: string) {
  const [config, availableAgents] = await Promise.all([
    getWorkflowBuilderConfig(workspaceId),
    listWorkflowBuilderAgents(workspaceId),
  ]);

  return { config, availableAgents };
}

export async function setWorkflowBuilderConfig(input: {
  workspaceId: string;
  agentId: string | null;
  updatedById: string;
}) {
  const value = workflowBuilderConfigSchema.parse({ agentId: input.agentId });

  if (value.agentId) {
    const availableAgents = await listWorkflowBuilderAgents(input.workspaceId);
    const selectedAgent = availableAgents.find(
      (agent) => agent.id === value.agentId,
    );
    if (!selectedAgent) {
      throw new Error("Workflow builder assistant not found");
    }
    if (!selectedAgent.ready) {
      throw new Error(
        "Workflow builder assistant requires an active tool-capable model",
      );
    }
  }

  await db
    .insert(appSettings)
    .values({
      key: settingKey(input.workspaceId),
      valueJson: value,
      updatedById: input.updatedById,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        valueJson: value,
        updatedById: input.updatedById,
        updatedAt: new Date(),
      },
    });

  return getWorkflowBuilderConfig(input.workspaceId);
}
