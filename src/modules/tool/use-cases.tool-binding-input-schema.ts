import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { agentToolBindings,customTools,mcpServers,mcpTools } from "@/server/infrastructure/db/schema";
import { and,eq,inArray,isNull } from "drizzle-orm";
import { z } from "zod";
import { insertToolBindingsForVersion } from "./use-cases.insert-tool-bindings-for-version";

export const toolBindingInputSchema = z.discriminatedUnion("toolSource", [
  z.object({
    toolSource: z.literal("builtin"),
    toolId: z.uuid(),
    requireApproval: z.boolean().optional(),
  }),
  z.object({
    toolSource: z.literal("mcp"),
    toolId: z.uuid(),
    mcpServerId: z.uuid(),
    requireApproval: z.boolean().optional(),
  }),
  z.object({
    toolSource: z.literal("custom"),
    toolId: z.uuid(),
    requireApproval: z.boolean().optional(),
  }),
]);

export type ToolBindingInput = z.infer<typeof toolBindingInputSchema>;
export type BindingDb = Pick<typeof db, "select" | "insert" | "delete">;

export async function canViewCustomTool(tool: { id: string; createdById: string; isGlobal: boolean }, userId: string) {
  return tool.createdById === userId || tool.isGlobal || authorization.hasPermission({ principalType: "user", principalId: userId }, "tools.view", "custom_tool", tool.id);
}

export async function canViewMcpServer(server: { id: string; createdById: string; isGlobal: boolean }, userId: string) {
  return server.createdById === userId || server.isGlobal || authorization.hasPermission({ principalType: "user", principalId: userId }, "mcpServers.get", "mcp_server", server.id);
}

export async function getToolBindingsForVersion(agentVersionId: string, visibility?: { workspaceId: string; userId: string }, executor: BindingDb = db) {
  const bindings = await executor.select().from(agentToolBindings).where(eq(agentToolBindings.agentVersionId, agentVersionId));
  if (!visibility) return bindings;

  const customToolIds = bindings.filter((binding) => binding.toolSource === "custom").map((binding) => binding.toolId);
  const mcpToolIds = bindings.filter((binding) => binding.toolSource === "mcp").map((binding) => binding.toolId);

  const [visibleCustomTools, visibleMcpTools] = await Promise.all([
    customToolIds.length > 0
      ? executor
          .select({
            id: customTools.id,
            createdById: customTools.createdById,
            isGlobal: customTools.isGlobal,
          })
          .from(customTools)
          .where(and(inArray(customTools.id, customToolIds), eq(customTools.workspaceId, visibility.workspaceId), isNull(customTools.archivedAt)))
      : Promise.resolve([]),
    mcpToolIds.length > 0
      ? executor
          .select({
            id: mcpTools.id,
            serverId: mcpServers.id,
            createdById: mcpServers.createdById,
            isGlobal: mcpServers.isGlobal,
          })
          .from(mcpTools)
          .innerJoin(mcpServers, eq(mcpTools.mcpServerId, mcpServers.id))
          .where(and(inArray(mcpTools.id, mcpToolIds), eq(mcpServers.workspaceId, visibility.workspaceId), isNull(mcpServers.archivedAt)))
      : Promise.resolve([]),
  ]);

  const visibleCustomToolIds = new Set((await Promise.all(visibleCustomTools.map(async (tool) => ((await canViewCustomTool(tool, visibility.userId)) ? tool.id : null)))).filter((id) => id !== null));
  const visibleMcpToolIds = new Set(
    (
      await Promise.all(
        visibleMcpTools.map(async (tool) =>
          (await canViewMcpServer(
            {
              id: tool.serverId,
              createdById: tool.createdById,
              isGlobal: tool.isGlobal,
            },
            visibility.userId,
          ))
            ? tool.id
            : null,
        ),
      )
    ).filter((id) => id !== null),
  );

  return bindings.filter((binding) => {
    if (binding.toolSource === "builtin") return true;
    if (binding.toolSource === "custom") {
      return visibleCustomToolIds.has(binding.toolId);
    }
    if (binding.toolSource === "mcp") {
      return visibleMcpToolIds.has(binding.toolId);
    }
    return false;
  });
}

export async function replaceToolBindingsForVersion(agentVersionId: string, bindings: ToolBindingInput[], workspaceId?: string, options?: { userId?: string }, executor: BindingDb = db) {
  await executor.delete(agentToolBindings).where(eq(agentToolBindings.agentVersionId, agentVersionId));
  await insertToolBindingsForVersion(agentVersionId, bindings, workspaceId, options, executor);
}
