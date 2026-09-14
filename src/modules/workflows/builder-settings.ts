import { and, asc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/infrastructure/db";
import {
  agents,
  agentVersions,
  aiModels,
  aiProviders,
  appSettings,
  workspaces,
} from "@/server/infrastructure/db/schema";

import { organizationIdForWorkspace } from "@/modules/organization/workspace-organization";
import { resourceAvailabilityCondition } from "@/modules/iam/resource-availability";

const WORKFLOW_BUILDER_SETTING_PREFIX = "workflowBuilder:organization:";

const workflowBuilderConfigSchema = z.object({
  agentId: z.uuid().nullable().default(null),
});

export type WorkflowBuilderConfig = z.infer<typeof workflowBuilderConfigSchema>;

function settingKey(organizationId: string) {
  return `${WORKFLOW_BUILDER_SETTING_PREFIX}${organizationId}`;
}

function parseConfig(value: unknown): WorkflowBuilderConfig {
  const parsed = workflowBuilderConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : { agentId: null };
}

export async function getWorkflowBuilderConfig(
  organizationId: string,
): Promise<WorkflowBuilderConfig> {
  const [row] = await db
    .select({ valueJson: appSettings.valueJson })
    .from(appSettings)
    .where(eq(appSettings.key, settingKey(organizationId)))
    .limit(1);

  return parseConfig(row?.valueJson);
}

export async function getConfiguredWorkflowBuilderAgentId(workspaceId: string) {
  const organizationId = await organizationIdForWorkspace(workspaceId);
  return organizationId
    ? (await getWorkflowBuilderConfig(organizationId)).agentId
    : null;
}

function builderAgentAvailability(organizationId: string) {
  return or(
    eq(workspaces.organizationId, organizationId),
    resourceAvailabilityCondition({
      type: "agent",
      id: agents.id,
      workspaceId: agents.workspaceId,
      activeWorkspaceId: "00000000-0000-0000-0000-000000000000",
      activeOrganizationId: organizationId,
      visibility: agents.visibility,
    }),
  );
}

export async function getOrganizationWorkflowBuilderAgent(
  agentId: string,
  workspaceId: string,
) {
  const organizationId = await organizationIdForWorkspace(workspaceId);
  if (!organizationId) return null;
  const [row] = await db
    .select({ agent: agents })
    .from(agents)
    .leftJoin(workspaces, eq(agents.workspaceId, workspaces.id))
    .where(
      and(
        eq(agents.id, agentId),
        isNull(agents.archivedAt),
        isNull(workspaces.archivedAt),
        builderAgentAvailability(organizationId),
      ),
    )
    .limit(1);
  return row?.agent ?? null;
}

async function listWorkflowBuilderAgents(organizationId: string) {
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
    .leftJoin(workspaces, eq(agents.workspaceId, workspaces.id))
    .leftJoin(agentVersions, eq(agents.activeVersionId, agentVersions.id))
    .leftJoin(aiProviders, eq(agentVersions.providerId, aiProviders.id))
    .leftJoin(
      aiModels,
      and(
        eq(agentVersions.modelId, aiModels.id),
        eq(aiModels.providerId, aiProviders.id),
      ),
    )
    .where(
      and(
        builderAgentAvailability(organizationId),
        isNull(agents.archivedAt),
        isNull(workspaces.archivedAt),
      ),
    )
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

export async function getWorkflowBuilderAdminState(organizationId: string) {
  const [config, availableAgents] = await Promise.all([
    getWorkflowBuilderConfig(organizationId),
    listWorkflowBuilderAgents(organizationId),
  ]);

  return { config, availableAgents };
}

export async function setWorkflowBuilderConfig(input: {
  organizationId: string;
  agentId: string | null;
  updatedById: string;
}) {
  const value = workflowBuilderConfigSchema.parse({ agentId: input.agentId });

  if (value.agentId) {
    const availableAgents = await listWorkflowBuilderAgents(
      input.organizationId,
    );
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
      key: settingKey(input.organizationId),
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

  return getWorkflowBuilderConfig(input.organizationId);
}
