import { db } from "@/server/infrastructure/db";
import {
  toolConnectionRequirements,
  toolConnectors,
  userToolSettings,
} from "@/server/infrastructure/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import {
  MCP_TOOL_SOURCE,
  ResolveToolExecutionHeadersInput,
  UpsertToolConnectionRequirementInput,
  UpsertUserToolSettingsInput,
  encryptRecord,
} from "./use-cases.mcp-tool-source";

export async function upsertToolConnectionRequirement(
  input: UpsertToolConnectionRequirementInput,
) {
  const [existing] = await db
    .select()
    .from(toolConnectionRequirements)
    .where(
      and(
        eq(toolConnectionRequirements.workspaceId, input.workspaceId),
        eq(toolConnectionRequirements.connectorId, input.connectorId),
        eq(toolConnectionRequirements.toolSource, input.toolSource),
        eq(toolConnectionRequirements.toolId, input.toolId),
      ),
    )
    .limit(1);

  if (existing) {
    const [requirement] = await db
      .update(toolConnectionRequirements)
      .set({
        required: input.required ?? existing.required,
        configSchemaJson: input.configSchema ?? existing.configSchemaJson,
        updatedAt: new Date(),
      })
      .where(eq(toolConnectionRequirements.id, existing.id))
      .returning();
    return requirement;
  }

  const [requirement] = await db
    .insert(toolConnectionRequirements)
    .values({
      workspaceId: input.workspaceId,
      connectorId: input.connectorId,
      toolSource: input.toolSource,
      toolId: input.toolId,
      required: input.required ?? true,
      configSchemaJson: input.configSchema ?? null,
    })
    .returning();
  return requirement;
}

export async function upsertUserToolSettings(
  input: UpsertUserToolSettingsInput,
) {
  const [existing] = await db
    .select()
    .from(userToolSettings)
    .where(
      and(
        eq(userToolSettings.workspaceId, input.workspaceId),
        eq(userToolSettings.userId, input.userId),
        eq(userToolSettings.toolSource, input.toolSource),
        eq(userToolSettings.toolId, input.toolId),
      ),
    )
    .limit(1);

  const values = {
    workspaceId: input.workspaceId,
    userId: input.userId,
    toolSource: input.toolSource,
    toolId: input.toolId,
    connectionId: input.connectionId,
    configJson: input.config,
    encryptedSecretsJson:
      input.secrets === undefined
        ? undefined
        : await encryptRecord(input.secrets),
    enabled: input.enabled,
    updatedAt: new Date(),
  };

  if (existing) {
    const [settings] = await db
      .update(userToolSettings)
      .set(values)
      .where(eq(userToolSettings.id, existing.id))
      .returning();
    return settings;
  }

  const [settings] = await db
    .insert(userToolSettings)
    .values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      toolSource: input.toolSource,
      toolId: input.toolId,
      connectionId: input.connectionId ?? null,
      configJson: input.config ?? null,
      encryptedSecretsJson: await encryptRecord(input.secrets),
      enabled: input.enabled ?? true,
    })
    .returning();
  return settings;
}

export async function findConnectorForTool(
  input: ResolveToolExecutionHeadersInput,
) {
  const [requirement] = await db
    .select()
    .from(toolConnectionRequirements)
    .where(
      and(
        eq(toolConnectionRequirements.workspaceId, input.workspaceId),
        eq(toolConnectionRequirements.toolSource, input.toolSource),
        eq(toolConnectionRequirements.toolId, input.toolId),
      ),
    )
    .limit(1);

  if (requirement) {
    const [connector] = await db
      .select()
      .from(toolConnectors)
      .where(
        and(
          eq(toolConnectors.id, requirement.connectorId),
          eq(toolConnectors.workspaceId, input.workspaceId),
          eq(toolConnectors.enabled, true),
          isNull(toolConnectors.archivedAt),
        ),
      )
      .limit(1);
    return { connector: connector ?? null, required: requirement.required };
  }

  if (input.toolSource !== MCP_TOOL_SOURCE || !input.mcpServerId) {
    return { connector: null, required: false };
  }

  const [connector] = await db
    .select()
    .from(toolConnectors)
    .where(
      and(
        eq(toolConnectors.workspaceId, input.workspaceId),
        eq(toolConnectors.mcpServerId, input.mcpServerId),
        eq(toolConnectors.enabled, true),
        isNull(toolConnectors.archivedAt),
      ),
    )
    .limit(1);

  return { connector: connector ?? null, required: Boolean(connector) };
}

export async function findUserToolSettings(
  input: ResolveToolExecutionHeadersInput,
) {
  const [settings] = await db
    .select()
    .from(userToolSettings)
    .where(
      and(
        eq(userToolSettings.workspaceId, input.workspaceId),
        eq(userToolSettings.userId, input.userId),
        eq(userToolSettings.toolSource, input.toolSource),
        eq(userToolSettings.toolId, input.toolId),
      ),
    )
    .limit(1);
  return settings ?? null;
}
