import { db } from "@/server/infrastructure/db";
import {
  agentToolBindings,
  customTools,
  mcpServers,
  mcpTools,
} from "@/server/infrastructure/db/schema";
import { and, eq, isNull, or } from "drizzle-orm";
import { insertToolBindingsForVersion } from "./use-cases.insert-tool-bindings-for-version";
import {
  BindingDb,
  ToolBindingInput,
  canViewCustomTool,
  canViewMcpServer,
  getToolBindingsForVersion,
} from "./use-cases.tool-binding-input-schema";

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

export async function getAvailableCustomToolContext(
  toolId: string,
  userId: string,
  workspaceId: string,
) {
  const [tool] = await db
    .select()
    .from(customTools)
    .where(
      and(
        eq(customTools.id, toolId),
        eq(customTools.workspaceId, workspaceId),
        eq(customTools.status, "active"),
        isNull(customTools.archivedAt),
      ),
    )
    .limit(1);
  return tool && (await canViewCustomTool(tool, userId)) ? { tool } : null;
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

export async function getAvailableMcpToolContext(
  toolId: string,
  userId: string,
  workspaceId: string,
) {
  const [tool] = await db
    .select()
    .from(mcpTools)
    .where(and(eq(mcpTools.id, toolId), eq(mcpTools.enabled, true)))
    .limit(1);
  if (!tool) return null;
  const [server] = await db
    .select()
    .from(mcpServers)
    .where(
      and(
        eq(mcpServers.id, tool.mcpServerId),
        eq(mcpServers.workspaceId, workspaceId),
        eq(mcpServers.enabled, true),
        isNull(mcpServers.archivedAt),
      ),
    )
    .limit(1);
  return server && (await canViewMcpServer(server, userId))
    ? { tool, server }
    : null;
}
