import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import { createBuiltinToolExecute } from "@/app/api/workspace/[agentId]/chat/route-support.create-builtin-tool-execute";
import { createMcpToolExecute } from "@/app/api/workspace/[agentId]/chat/route-support.create-mcp-tool-execute";
import { createCustomToolExecute } from "@/app/api/workspace/[agentId]/chat/route-support.build-external-tool-key";
import { createToolExecutionContext } from "@/app/api/workspace/[agentId]/chat/route-support.tool-execution-context";
import { getBuiltInTool, requiresApproval } from "@/modules/tool/builtin-tools";
import { getOrganizationBuiltInToolPolicyMap } from "@/modules/tool/organization-builtin-tool-policies";
import {
  canExecuteRestrictedTool,
  getAvailableMcpToolContext,
  getAvailableCustomToolContext,
} from "@/modules/tool/use-cases";
import { workflowToolParametersSchema } from "./tool-contracts";

export async function executeWorkflowTool(input: {
  workspaceId: string;
  userId: string;
  parameters: unknown;
  signal?: AbortSignal;
}) {
  const params = workflowToolParametersSchema.parse(input.parameters);
  input.signal?.throwIfAborted();
  const context = {
    ...input,
    connectionId: params.connectionId,
    maxToolCalls: 1,
    nonInteractive: true,
  };
  const { reserveToolCall, toolLimitReachedResult, gateToolExecution } =
    createToolExecutionContext(context);
  let execute: (args: unknown) => Promise<unknown>;
  let args: unknown = params.arguments;
  if (params.source === "builtin") {
    const definition = getBuiltInTool(params.toolId);
    if (!definition) throw new Error("Workflow tool not found");
    const policy = (
      await getOrganizationBuiltInToolPolicyMap(input.workspaceId)
    ).get(definition.name);
    if (policy?.enabled === false)
      throw new Error("Workflow tool is disabled by the organization");
    args = definition.inputSchema.parse(args);
    execute = createBuiltinToolExecute(
      context,
      definition,
      {
        riskLevel: definition.riskLevel,
        requireApproval:
          policy?.requireApproval ?? requiresApproval(definition.riskLevel),
      },
      reserveToolCall,
      toolLimitReachedResult,
      gateToolExecution,
      canExecuteRestrictedTool,
    );
  } else if (params.source === "mcp") {
    const available = await getAvailableMcpToolContext(
      params.toolId,
      input.userId,
      input.workspaceId,
    );
    if (!available)
      throw new Error("Workflow MCP tool is unavailable or inaccessible");
    validateArguments(available.tool.inputSchemaJson, args);
    execute = createMcpToolExecute(
      context,
      available.tool,
      { riskLevel: null, requireApproval: false },
      {
        serverRequiresApproval: available.server.requireApproval,
        toolRequiresApproval: available.tool.requireApproval,
      },
      reserveToolCall,
      toolLimitReachedResult,
      gateToolExecution,
    );
  } else {
    const available = await getAvailableCustomToolContext(
      params.toolId,
      input.userId,
      input.workspaceId,
    );
    if (!available)
      throw new Error("Workflow custom tool is unavailable or inaccessible");
    validateArguments(available.tool.inputSchemaJson, args);
    execute = createCustomToolExecute(
      context,
      available.tool,
      { riskLevel: null, requireApproval: true },
      reserveToolCall,
      toolLimitReachedResult,
      gateToolExecution,
    );
  }
  input.signal?.throwIfAborted();
  const result = await execute(args);
  if (
    result &&
    typeof result === "object" &&
    "denied" in result &&
    result.denied === true
  ) {
    throw new Error(
      "Workflow tool execution denied. Check tool permissions and background approval policies.",
    );
  }
  return result;
}

function validateArguments(schema: unknown, args: unknown) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return;
  const result = new AjvJsonSchemaValidator().getValidator(
    schema as Record<string, unknown>,
  )(args);
  if (!result.valid)
    throw new Error(`Invalid workflow tool arguments: ${result.errorMessage}`);
}
