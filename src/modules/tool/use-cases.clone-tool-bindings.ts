import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { encryptValue } from "@/lib/crypto";
import { logHandledError } from "@/lib/logger";
import { safeToolErrorMessage } from "@/modules/tool/safe-payload";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  agentToolBindings,
  agentVersions,
  customTools,
  mcpServers,
  mcpTools,
  toolInvocations,
} from "@/server/infrastructure/db/schema";
import { getBuiltInTool, requiresApproval } from "./builtin-tools";
import {
  BindingDb,
  ToolBindingInput,
  getToolBindingsForVersion,
} from "./use-cases.tool-binding-input-schema";
import { insertToolBindingsForVersion } from "./use-cases.insert-tool-bindings-for-version";

export async function cloneToolBindings(
  fromAgentVersionId: string | null,
  toAgentVersionId: string,
  workspaceId?: string,
  options?: { userId?: string },
  executor: BindingDb = db,
) {
  if (!fromAgentVersionId) return;
  const existing = await getToolBindingsForVersion(
    fromAgentVersionId,
    undefined,
    executor,
  );
  const inputs: ToolBindingInput[] = [];

  for (const binding of existing) {
    if (binding.toolSource === "custom") {
      inputs.push({
        toolSource: "custom",
        toolId: binding.toolId,
        requireApproval: binding.requireApproval,
      });
      continue;
    }

    if (binding.toolSource === "mcp") {
      const [tool] = await executor
        .select({ mcpServerId: mcpTools.mcpServerId })
        .from(mcpTools)
        .where(eq(mcpTools.id, binding.toolId))
        .limit(1);
      if (!tool) continue;
      inputs.push({
        toolSource: "mcp",
        toolId: binding.toolId,
        mcpServerId: tool.mcpServerId,
        requireApproval: binding.requireApproval,
      });
      continue;
    }

    inputs.push({
      toolSource: "builtin",
      toolId: binding.toolId,
      requireApproval: binding.requireApproval,
    });
  }

  await insertToolBindingsForVersion(
    toAgentVersionId,
    inputs,
    workspaceId,
    options,
    executor,
  );
}

export async function getCustomBindingContext(
  agentVersionId: string,
  toolId: string,
  userId: string,
  workspaceId: string,
) {
  const [binding] = await db
    .select()
    .from(agentToolBindings)
    .where(
      and(
        eq(agentToolBindings.agentVersionId, agentVersionId),
        eq(agentToolBindings.toolId, toolId),
        eq(agentToolBindings.toolSource, "custom"),
      ),
    )
    .limit(1);

  if (!binding) return null;

  const [tool] = await db
    .select()
    .from(customTools)
    .where(
      and(
        eq(customTools.id, toolId),
        eq(customTools.workspaceId, workspaceId),
        isNull(customTools.archivedAt),
        or(eq(customTools.createdById, userId), eq(customTools.isGlobal, true)),
      ),
    )
    .limit(1);

  return tool ? { binding, tool } : null;
}

export async function getMcpBindingContext(
  agentVersionId: string,
  toolId: string,
  userId?: string,
  workspaceId?: string,
) {
  const [binding] = await db
    .select()
    .from(agentToolBindings)
    .where(
      and(
        eq(agentToolBindings.agentVersionId, agentVersionId),
        eq(agentToolBindings.toolId, toolId),
        eq(agentToolBindings.toolSource, "mcp"),
      ),
    )
    .limit(1);

  if (!binding) return null;

  const [tool] = await db
    .select()
    .from(mcpTools)
    .where(eq(mcpTools.id, toolId))
    .limit(1);

  if (!tool) return null;

  const [server] = await db
    .select()
    .from(mcpServers)
    .where(
      and(
        eq(mcpServers.id, tool.mcpServerId),
        workspaceId ? eq(mcpServers.workspaceId, workspaceId) : undefined,
        isNull(mcpServers.archivedAt),
        userId
          ? or(
              eq(mcpServers.createdById, userId),
              eq(mcpServers.isGlobal, true),
            )
          : undefined,
      ),
    )
    .limit(1);

  return server ? { binding, tool, server } : null;
}
