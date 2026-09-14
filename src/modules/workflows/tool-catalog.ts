import { listToolExecutionConnections } from "@/modules/tool-connections/use-cases.build-signed-tool-context-headers";
import { objectValue } from "./runtime.workflow-runtime-dependencies";
import { z } from "zod";
import { getBuiltInTool, listBuiltInTools } from "@/modules/tool/builtin-tools";
import { getOrganizationBuiltInToolPolicyMap } from "@/modules/tool/organization-builtin-tool-policies";
import { listMcpServers, listMcpTools } from "@/modules/mcp/use-cases";
import { listCustomTools } from "@/modules/custom-tools/use-cases";
import { getAvailableCustomToolContext } from "@/modules/tool/use-cases";
import type { WorkflowToolOption } from "./tool-contracts";

export async function listWorkflowTools(
  workspaceId: string,
  userId: string,
): Promise<WorkflowToolOption[]> {
  const [policies, servers, custom] = await Promise.all([
    getOrganizationBuiltInToolPolicyMap(workspaceId),
    listMcpServers(workspaceId, userId),
    listCustomTools(workspaceId, userId),
  ]);
  const builtin: WorkflowToolOption[] = listBuiltInTools()
    .filter((tool) => policies.get(tool.name)?.enabled !== false)
    .map((tool) => ({
      id: tool.id,
      source: "builtin",
      name: tool.displayName,
      description: tool.description,
      group: "Maiah",
      inputSchema: z.toJSONSchema(getBuiltInTool(tool.id)!.inputSchema, {
        io: "input",
      }),
      requireApproval:
        policies.get(tool.name)?.requireApproval ??
        tool.requiresApprovalByDefault,
    }));
  const mcp = await Promise.all(
    servers
      .filter((server) => server.enabled && server.workspaceId === workspaceId)
      .map(async (server) => {
        const tools = await listMcpTools(server.id, workspaceId, userId);
        return Promise.all(
          tools
            .filter((tool) => tool.enabled)
            .map(
              async (tool): Promise<WorkflowToolOption> => ({
                connections: await listToolExecutionConnections({
                  workspaceId,
                  userId,
                  toolSource: "mcp",
                  toolId: tool.id,
                  mcpServerId: server.id,
                }),
                id: tool.id,
                source: "mcp",
                name: tool.name,
                description: tool.description,
                group: server.name,
                inputSchema: tool.inputSchemaJson
                  ? objectValue(tool.inputSchemaJson)
                  : null,
                outputSchema: tool.outputSchemaJson
                  ? objectValue(tool.outputSchemaJson)
                  : null,
                requireApproval: server.requireApproval || tool.requireApproval,
              }),
            ),
        );
      }),
  );
  const customOptions = await Promise.all(
    custom
      .filter((tool) => tool.status === "active")
      .map(async (tool) => {
        const available = await getAvailableCustomToolContext(
          tool.id,
          userId,
          workspaceId,
        );
        if (!available) return null;
        return {
          id: tool.id,
          source: "custom",
          name: tool.name,
          description: tool.description,
          group: "Custom",
          inputSchema: available.tool.inputSchemaJson
            ? objectValue(available.tool.inputSchemaJson)
            : null,
          requireApproval: true,
        } satisfies WorkflowToolOption;
      }),
  );
  return [
    ...builtin,
    ...mcp.flat(),
    ...customOptions.filter(
      (tool): tool is NonNullable<typeof tool> => tool !== null,
    ),
  ];
}
