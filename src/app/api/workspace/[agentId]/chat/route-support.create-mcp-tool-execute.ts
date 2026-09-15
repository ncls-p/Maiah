import { executeMcpTool } from "@/modules/mcp/executor";
import { logToolInvocation } from "@/modules/tool/use-cases";
import {
  TOOL_GATE_RETURN,
  ToolGateResult,
} from "./route-support.chat-request-schema";

export function createMcpToolExecute(
  input: {
    workspaceId: string;
    userId: string;
    conversationId?: string;
    messageId?: string;
    connectionId?: string;
    connectionLabel?: string;
    expectedInstanceUrl?: string;
  },
  mcpTool: { id: string; name: string; mcpServerId: string },
  binding: { riskLevel: string | null; requireApproval: boolean },
  approvalConfig: {
    serverRequiresApproval: boolean;
    toolRequiresApproval: boolean;
  },
  reserveToolCall: () => boolean,
  toolLimitReachedResult: () => unknown,
  gateToolExecution: (args: {
    startedAt: number;
    toolSource: "mcp";
    toolId: string;
    toolName: string;
    riskLevel: string | null;
    toolInput: unknown;
    bindingRequiresApproval: boolean;
    serverRequiresApproval: boolean;
    toolRequiresApproval: boolean;
  }) => Promise<ToolGateResult>,
): (toolInput: unknown) => Promise<unknown> {
  return async (toolInput: unknown) => {
    const startedAt = Date.now();
    const invocationInput = input.connectionId
      ? {
          maiahConnectionRouting: 1,
          connectionId: input.connectionId,
          connectionLabel: input.connectionLabel,
          instanceUrl: input.expectedInstanceUrl,
          arguments: toolInput,
        }
      : toolInput;
    if (!reserveToolCall()) {
      await logToolInvocation({
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        toolSource: "mcp",
        toolId: mcpTool.id,
        toolName: mcpTool.name,
        riskLevel: binding.riskLevel,
        input: invocationInput,
        status: "denied",
        latencyMs: Date.now() - startedAt,
        errorMessage: "Tool call limit reached",
      });
      return toolLimitReachedResult();
    }
    const gate = await gateToolExecution({
      startedAt,
      toolSource: "mcp",
      toolId: mcpTool.id,
      toolName: mcpTool.name,
      riskLevel: binding.riskLevel,
      toolInput: invocationInput,
      bindingRequiresApproval: binding.requireApproval,
      serverRequiresApproval: approvalConfig.serverRequiresApproval,
      toolRequiresApproval: approvalConfig.toolRequiresApproval,
    });
    if (gate.status === TOOL_GATE_RETURN) return gate.output;

    try {
      const output = await executeMcpTool({
        serverId: mcpTool.mcpServerId,
        toolId: mcpTool.id,
        workspaceId: input.workspaceId,
        userId: input.userId,
        toolInput,
        connectionId: input.connectionId,
        expectedInstanceUrl: input.expectedInstanceUrl,
      });
      await logToolInvocation({
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        toolSource: "mcp",
        toolId: mcpTool.id,
        toolName: mcpTool.name,
        riskLevel: binding.riskLevel,
        input: invocationInput,
        output,
        status: "success",
        latencyMs: Date.now() - startedAt,
      });
      return output;
    } catch (error) {
      await logToolInvocation({
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        toolSource: "mcp",
        toolId: mcpTool.id,
        toolName: mcpTool.name,
        riskLevel: binding.riskLevel,
        input: invocationInput,
        status: "failed",
        latencyMs: Date.now() - startedAt,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}
