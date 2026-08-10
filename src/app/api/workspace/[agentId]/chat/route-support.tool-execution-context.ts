import { decideToolApproval } from "@/modules/tool/approval-policy";
import { waitForApproval } from "@/modules/tool/invocation-state";
import { evaluateOpaToolApprovalPolicy } from "@/modules/tool/opa-approval-policy";
import { projectToolPayloadForDisplay } from "@/modules/tool/safe-payload";
import { logToolInvocation } from "@/modules/tool/use-cases";

import type { BuildBoundToolsInput } from "./route-support.build-bound-tools";
import {
  BUILTIN_TOOL_SOURCE,
  TOOL_GATE_RETURN,
  type ToolGateResult,
} from "./route-support.chat-request-schema";

export type GateToolExecution = (input: {
  startedAt: number;
  toolSource: typeof BUILTIN_TOOL_SOURCE | "custom" | "mcp";
  toolId: string;
  toolName: string;
  riskLevel?: string | null;
  toolInput: unknown;
  bindingRequiresApproval?: boolean;
  serverRequiresApproval?: boolean;
  toolRequiresApproval?: boolean;
}) => Promise<ToolGateResult>;

export function createToolExecutionContext(input: BuildBoundToolsInput) {
  let executedToolCallCount = 0;

  function reserveToolCall() {
    if (executedToolCallCount >= input.maxToolCalls) return false;
    executedToolCallCount += 1;
    return true;
  }

  function toolLimitReachedResult() {
    return {
      denied: true,
      message:
        "Tool call limit reached. Answer the user now using the information already gathered.",
    };
  }

  const gateToolExecution: GateToolExecution = async (tool) => {
    const decision =
      (await evaluateOpaToolApprovalPolicy({
        toolName: tool.toolName,
        toolSource: tool.toolSource,
        riskLevel: tool.riskLevel,
        toolInput: tool.toolInput,
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        userId: input.userId,
        agentVersionId: input.agentVersionId,
      })) ??
      decideToolApproval({
        policy: input.approvalPolicy,
        toolName: tool.toolName,
        toolSource: tool.toolSource,
        riskLevel: tool.riskLevel,
        bindingRequiresApproval: tool.bindingRequiresApproval,
        serverRequiresApproval: tool.serverRequiresApproval,
        toolRequiresApproval: tool.toolRequiresApproval,
        skipDefaultRiskApproval: tool.toolSource === BUILTIN_TOOL_SOURCE,
      });

    if (decision.status === "allow") return { status: "continue" };

    if (decision.status === "deny") {
      await logToolInvocation({
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        toolSource: tool.toolSource,
        toolId: tool.toolId,
        toolName: tool.toolName,
        riskLevel: tool.riskLevel,
        input: tool.toolInput,
        status: "denied",
        latencyMs: Date.now() - tool.startedAt,
        errorMessage: decision.reason ?? "Tool denied by approval policy",
      });
      return {
        status: TOOL_GATE_RETURN,
        output: {
          denied: true,
          message: decision.reason ?? "Tool denied by approval policy.",
        },
      };
    }

    if (input.nonInteractive) {
      await logToolInvocation({
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        toolSource: tool.toolSource,
        toolId: tool.toolId,
        toolName: tool.toolName,
        riskLevel: tool.riskLevel,
        input: tool.toolInput,
        status: "denied",
        latencyMs: Date.now() - tool.startedAt,
        errorMessage: "Human approval is unavailable for this run",
      });
      return {
        status: TOOL_GATE_RETURN,
        output: {
          denied: true,
          message:
            "This tool requires human approval and cannot run in a delegated, scheduled, or API execution.",
        },
      };
    }

    const invocation = await logToolInvocation({
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      toolSource: tool.toolSource,
      toolId: tool.toolId,
      toolName: tool.toolName,
      riskLevel: tool.riskLevel,
      input: tool.toolInput,
      status: "awaiting_approval",
      latencyMs: Date.now() - tool.startedAt,
    });
    input.onApprovalRequired?.({
      invocationId: invocation.id,
      toolName: tool.toolName,
      input: projectToolPayloadForDisplay(tool.toolInput),
    });

    const result = await waitForApproval(invocation.id);
    if (result.status === "success")
      return { status: TOOL_GATE_RETURN, output: result.output };
    return {
      status: TOOL_GATE_RETURN,
      output: {
        denied: true,
        invocationId: invocation.id,
        message: result.error ?? "Tool invocation was not approved.",
      },
    };
  };

  return { reserveToolCall, toolLimitReachedResult, gateToolExecution };
}
