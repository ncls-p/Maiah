import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { decryptValue } from "@/lib/crypto";
import { normalizeOpenAICompatibleApiRoute } from "@/lib/openai-compatible-api";
import { authorization } from "@/server/domain/services/authorization";
import { registerAiSdkDevTools } from "@/server/infrastructure/ai-sdk/devtools";
import { db } from "@/server/infrastructure/db";
import {
  aiModels,
  aiProviders,
  appSettings,
  customTools,
  mcpServers,
} from "@/server/infrastructure/db/schema";
import {
  type ProviderKind,
  type ProviderRuntimeConfig,
} from "@/server/infrastructure/providers";

registerAiSdkDevTools();

const CUSTOM_TOOL_BUILDER_SETTING_KEY = "customToolBuilder";

export type CustomToolRow = typeof customTools.$inferSelect;

export async function canManageCustomTool(
  customTool: CustomToolRow,
  userId: string,
  canManageGlobal = false,
) {
  return (
    customTool.createdById === userId ||
    (customTool.isGlobal && canManageGlobal) ||
    (await authorization.hasPermission(
      { principalType: "user", principalId: userId },
      "tools.configure",
      "custom_tool",
      customTool.id,
    ))
  );
}

export const secretFieldSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z0-9_.-]+$/),
  label: z.string().trim().min(1).max(120),
  type: z
    .enum(["secret", "text", "url", "email", "password"])
    .default("secret"),
  required: z.boolean().default(true),
  description: z.string().trim().max(500).optional(),
});

export type SecretField = z.infer<typeof secretFieldSchema>;

const builderConfigSchema = z.object({
  enabled: z.boolean().default(false),
  workspaceId: z.uuid().optional(),
  providerId: z.uuid().optional(),
  modelId: z.uuid().optional(),
  n8nMcpServerId: z.uuid().optional(),
  createWorkflowToolName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .default("n8n_create_workflow"),
  validateWorkflowToolName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .default("n8n_validate_workflow"),
  activateWorkflowToolName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .default("n8n_update_partial_workflow"),
  credentialToolName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .default("n8n_manage_credentials"),
  allowWorkflowActivation: z.boolean().default(false),
});

export type CustomToolBuilderConfig = z.infer<typeof builderConfigSchema>;

export type BuilderMessage = {
  role: "user" | "assistant";
  content: string;
};

function defaultBuilderConfig(): CustomToolBuilderConfig {
  return {
    enabled: false,
    createWorkflowToolName: "n8n_create_workflow",
    validateWorkflowToolName: "n8n_validate_workflow",
    activateWorkflowToolName: "n8n_update_partial_workflow",
    credentialToolName: "n8n_manage_credentials",
    allowWorkflowActivation: false,
  };
}

function parseBuilderConfig(value: unknown): CustomToolBuilderConfig {
  const parsed = builderConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultBuilderConfig();
}

export async function getCustomToolBuilderConfig() {
  const [row] = await db
    .select({ valueJson: appSettings.valueJson })
    .from(appSettings)
    .where(eq(appSettings.key, CUSTOM_TOOL_BUILDER_SETTING_KEY))
    .limit(1);
  return parseBuilderConfig(row?.valueJson);
}

export async function setCustomToolBuilderConfig(
  input: CustomToolBuilderConfig,
  updatedById: string,
) {
  const value = builderConfigSchema.parse(input);
  await db
    .insert(appSettings)
    .values({
      key: CUSTOM_TOOL_BUILDER_SETTING_KEY,
      valueJson: value,
      updatedById,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { valueJson: value, updatedById, updatedAt: new Date() },
    });
  return getCustomToolBuilderConfig();
}

export async function getCustomToolBuilderAdminState() {
  const [config, providers, servers] = await Promise.all([
    getCustomToolBuilderConfig(),
    db
      .select({
        id: aiProviders.id,
        workspaceId: aiProviders.workspaceId,
        name: aiProviders.name,
        kind: aiProviders.kind,
        enabled: aiProviders.enabled,
      })
      .from(aiProviders)
      .where(and(eq(aiProviders.enabled, true), isNull(aiProviders.archivedAt)))
      .orderBy(aiProviders.name),
    db
      .select({
        id: mcpServers.id,
        workspaceId: mcpServers.workspaceId,
        name: mcpServers.name,
        transport: mcpServers.transport,
        url: mcpServers.url,
        enabled: mcpServers.enabled,
      })
      .from(mcpServers)
      .where(and(eq(mcpServers.enabled, true), isNull(mcpServers.archivedAt)))
      .orderBy(mcpServers.name),
  ]);

  const models = await db
    .select({
      id: aiModels.id,
      providerId: aiModels.providerId,
      modelId: aiModels.modelId,
      displayName: aiModels.displayName,
      enabled: aiModels.enabled,
    })
    .from(aiModels)
    .where(eq(aiModels.enabled, true))
    .orderBy(aiModels.displayName, aiModels.modelId);

  return { config, providers, models, mcpServers: servers };
}

export async function resolveRuntimeProvider(config: CustomToolBuilderConfig) {
  if (!config.providerId || !config.modelId) return null;
  const [provider] = await db
    .select()
    .from(aiProviders)
    .where(
      and(
        eq(aiProviders.id, config.providerId),
        eq(aiProviders.enabled, true),
        isNull(aiProviders.archivedAt),
      ),
    )
    .limit(1);
  if (!provider) return null;

  const [model] = await db
    .select()
    .from(aiModels)
    .where(
      and(
        eq(aiModels.id, config.modelId),
        eq(aiModels.providerId, provider.id),
        eq(aiModels.enabled, true),
      ),
    )
    .limit(1);
  if (!model) return null;

  let apiKey: string | undefined;
  if (provider.encryptedApiKey)
    apiKey = await decryptValue(provider.encryptedApiKey);

  let headers: Record<string, string> | undefined;
  if (provider.encryptedHeadersJson) {
    headers = {};
    for (const [key, value] of Object.entries(
      provider.encryptedHeadersJson as Record<string, string>,
    )) {
      headers[key] = await decryptValue(value);
    }
  }

  const runtimeConfig: ProviderRuntimeConfig = {
    kind: provider.kind as ProviderKind,
    name: provider.name,
    baseUrl: provider.baseUrl || undefined,
    authType: provider.authType,
    apiKey,
    headers,
    queryParams: provider.queryParamsJson as Record<string, string> | undefined,
    openaiCompatibleApiRoute: normalizeOpenAICompatibleApiRoute(
      provider.openaiCompatibleApiRoute,
    ),
  };

  return {
    runtimeConfig,
    kind: provider.kind as ProviderKind,
    modelId: model.modelId,
  };
}
