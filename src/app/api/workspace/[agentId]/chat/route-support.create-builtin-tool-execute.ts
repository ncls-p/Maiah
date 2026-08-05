import {
requiresApproval
} from "@/modules/tool/builtin-tools";
import {
logToolInvocation
} from "@/modules/tool/use-cases";
import { authorization } from "@/server/domain/services/authorization";
import { BUILTIN_TOOL_SOURCE,TOOL_GATE_RETURN,ToolGateResult } from "./route-support.chat-request-schema";


export function createBuiltinToolExecute(
  input: {
    workspaceId: string;
    conversationId?: string;
    messageId?: string;
    userId: string;
    emitEvent?: (event: Record<string, unknown>) => void;
  },
  definition: {
    id: string;
    name: string;
    riskLevel: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: (...args: any[]) => any;
  },
  binding: { riskLevel: string | null; requireApproval: boolean },
  reserveToolCall: () => boolean,
  toolLimitReachedResult: () => unknown,
  gateToolExecution: (args: {
    startedAt: number;
    toolSource: "builtin";
    toolId: string;
    toolName: string;
    riskLevel: string | null;
    toolInput: unknown;
    bindingRequiresApproval: boolean;
  }) => Promise<ToolGateResult>,
  canExecuteRestrictedToolFn: (
    userId: string,
    workspaceId: string,
  ) => Promise<boolean>,
): (toolInput: unknown) => Promise<unknown> {
  return async (toolInput: unknown) => {
    const startedAt = Date.now();
    if (!reserveToolCall()) {
      await logToolInvocation({
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        toolSource: BUILTIN_TOOL_SOURCE,
        toolId: definition.id,
        toolName: definition.name,
        riskLevel: definition.riskLevel,
        input: toolInput,
        status: "denied",
        latencyMs: Date.now() - startedAt,
        errorMessage: "Tool call limit reached",
      });
      return toolLimitReachedResult();
    }
    const restricted = requiresApproval(definition.riskLevel);

    if (restricted) {
      const canExecute =
        definition.name === "github_publish_code_workspace"
          ? await authorization.hasPermission(
              { principalType: "user", principalId: input.userId },
              "agents.chat",
              "workspace",
              input.workspaceId,
            )
          : await canExecuteRestrictedToolFn(input.userId, input.workspaceId);
      if (!canExecute) {
        await logToolInvocation({
          workspaceId: input.workspaceId,
          conversationId: input.conversationId,
          messageId: input.messageId,
          toolSource: BUILTIN_TOOL_SOURCE,
          toolId: definition.id,
          toolName: definition.name,
          riskLevel: definition.riskLevel,
          input: toolInput,
          status: "denied",
          latencyMs: Date.now() - startedAt,
          errorMessage: "Missing permission: tools.executeRestricted",
        });
        return {
          denied: true,
          message:
            "You do not have permission to execute this restricted tool.",
        };
      }
    }

    const gate = await gateToolExecution({
      startedAt,
      toolSource: BUILTIN_TOOL_SOURCE,
      toolId: definition.id,
      toolName: definition.name,
      riskLevel: definition.riskLevel,
      toolInput,
      bindingRequiresApproval: binding.requireApproval,
    });
    if (gate.status === TOOL_GATE_RETURN) return gate.output;

    try {
      const output = await definition.execute(toolInput as never, {
        workspaceId: input.workspaceId,
        userId: input.userId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        emitEvent: input.emitEvent,
      });
      await logToolInvocation({
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        toolSource: BUILTIN_TOOL_SOURCE,
        toolId: definition.id,
        toolName: definition.name,
        riskLevel: definition.riskLevel,
        input: toolInput,
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
        toolSource: BUILTIN_TOOL_SOURCE,
        toolId: definition.id,
        toolName: definition.name,
        riskLevel: definition.riskLevel,
        input: toolInput,
        status: "failed",
        latencyMs: Date.now() - startedAt,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}
