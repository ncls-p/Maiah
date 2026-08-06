import { logHandledError } from "@/lib/logger";
import { db } from "@/server/infrastructure/db";
import { agentToolBindings,customTools,mcpServers,mcpTools } from "@/server/infrastructure/db/schema";
import { and,eq,isNull } from "drizzle-orm";
import { getBuiltInTool,requiresApproval } from "./builtin-tools";
import { BindingDb,ToolBindingInput,canViewCustomTool,canViewMcpServer } from "./use-cases.tool-binding-input-schema";

export async function insertToolBindingsForVersion(agentVersionId: string, bindings: ToolBindingInput[], workspaceId?: string, options?: { userId?: string }, executor: BindingDb = db) {
  if (bindings.length === 0) return;

  try {
    const values = await Promise.all(
      bindings.map(async (binding) => {
        if (binding.toolSource === "custom") {
          const customToolFilters = workspaceId ? and(eq(customTools.id, binding.toolId), eq(customTools.workspaceId, workspaceId), isNull(customTools.archivedAt)) : eq(customTools.id, binding.toolId);
          const [customTool] = await executor.select().from(customTools).where(customToolFilters).limit(1);
          if (!customTool) throw new Error("Custom tool not found");
          if (options?.userId && !(await canViewCustomTool(customTool, options.userId))) {
            throw new Error("Custom tool not found");
          }

          return {
            agentVersionId,
            toolSource: "custom" as const,
            toolId: binding.toolId,
            requireApproval: binding.requireApproval ?? true,
            riskLevel: "medium",
          };
        }

        if (binding.toolSource === "mcp") {
          const [tool] = workspaceId
            ? await executor
                .select({
                  requireApproval: mcpTools.requireApproval,
                  serverId: mcpServers.id,
                  createdById: mcpServers.createdById,
                  isGlobal: mcpServers.isGlobal,
                })
                .from(mcpTools)
                .innerJoin(mcpServers, eq(mcpTools.mcpServerId, mcpServers.id))
                .where(and(eq(mcpTools.id, binding.toolId), eq(mcpTools.mcpServerId, binding.mcpServerId), eq(mcpServers.workspaceId, workspaceId), eq(mcpServers.enabled, true), isNull(mcpServers.archivedAt)))
                .limit(1)
            : await executor
                .select()
                .from(mcpTools)
                .where(and(eq(mcpTools.id, binding.toolId), eq(mcpTools.mcpServerId, binding.mcpServerId)))
                .limit(1);
          if (!tool) throw new Error("MCP tool not found");
          if (
            options?.userId &&
            "serverId" in tool &&
            !(await canViewMcpServer(
              {
                id: tool.serverId,
                createdById: tool.createdById,
                isGlobal: tool.isGlobal,
              },
              options.userId,
            ))
          ) {
            throw new Error("MCP tool not found");
          }

          return {
            agentVersionId,
            toolSource: "mcp" as const,
            toolId: binding.toolId,
            requireApproval: binding.requireApproval ?? tool.requireApproval,
            riskLevel: "medium",
          };
        }

        const tool = getBuiltInTool(binding.toolId);
        if (!tool) throw new Error("Tool not found");

        return {
          agentVersionId,
          toolSource: "builtin" as const,
          toolId: binding.toolId,
          requireApproval: binding.requireApproval ?? requiresApproval(tool.riskLevel),
          riskLevel: tool.riskLevel,
        };
      }),
    );

    await executor.insert(agentToolBindings).values(values).onConflictDoNothing();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!["Custom tool not found", "MCP tool not found", "Tool not found"].includes(message)) {
      logHandledError("Failed to insert tool bindings", { agentVersionId }, error as Error);
    }
    throw error;
  }
}
