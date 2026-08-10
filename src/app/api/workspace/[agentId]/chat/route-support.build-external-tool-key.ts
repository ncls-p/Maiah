import { executeCustomToolWorkflow } from "@/modules/custom-tools/use-cases";
import { logToolInvocation } from "@/modules/tool/use-cases";
import {
  MAX_OPENAI_TOOL_NAME_LENGTH,
  TOOL_GATE_RETURN,
  ToolGateResult,
  sanitizeToolKeyPart,
} from "./route-support.chat-request-schema";

function stableToolKeyHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(7, "0").slice(0, 8);
}

export function buildExternalToolKey({
  source,
  toolId,
  toolName,
  usedKeys,
}: {
  source: "custom" | "mcp";
  toolId: string;
  toolName: string;
  usedKeys: Set<string>;
}) {
  const sanitizedName = sanitizeToolKeyPart(toolName) || "tool";
  const fullKey = `${source}_${toolId.replace(/-/g, "_")}_${sanitizedName}`;
  if (fullKey.length <= MAX_OPENAI_TOOL_NAME_LENGTH && !usedKeys.has(fullKey)) {
    usedKeys.add(fullKey);
    return fullKey;
  }

  const hash = stableToolKeyHash(`${source}:${toolId}:${toolName}`);
  const prefix = `${source}_${hash}_`;
  const suffixLimit = MAX_OPENAI_TOOL_NAME_LENGTH - prefix.length;
  const baseSuffix =
    sanitizedName.slice(0, suffixLimit).replace(/_+$/g, "") || "tool";
  let key = `${prefix}${baseSuffix}`;
  let counter = 2;
  while (usedKeys.has(key)) {
    const counterSuffix = `_${counter.toString(36)}`;
    const adjustedSuffix =
      baseSuffix
        .slice(0, Math.max(1, suffixLimit - counterSuffix.length))
        .replace(/_+$/g, "") || "tool";
    key = `${prefix}${adjustedSuffix}${counterSuffix}`;
    counter += 1;
  }
  usedKeys.add(key);
  return key;
}

// --- Execute handlers extracted from loops to avoid function-in-loop ---

export function createCustomToolExecute(
  input: {
    workspaceId: string;
    conversationId?: string;
    messageId?: string;
    userId: string;
    agentVersionId: string;
  },
  customTool: { id: string; name: string },
  binding: { riskLevel: string | null; requireApproval: boolean },
  reserveToolCall: () => boolean,
  toolLimitReachedResult: () => unknown,
  gateToolExecution: (args: {
    startedAt: number;
    toolSource: "custom";
    toolId: string;
    toolName: string;
    riskLevel: string | null;
    toolInput: unknown;
    bindingRequiresApproval: boolean;
  }) => Promise<ToolGateResult>,
): (toolInput: unknown) => Promise<unknown> {
  return async (toolInput: unknown) => {
    const startedAt = Date.now();
    if (!reserveToolCall()) {
      await logToolInvocation({
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        toolSource: "custom",
        toolId: customTool.id,
        toolName: customTool.name,
        riskLevel: binding.riskLevel,
        input: toolInput,
        status: "denied",
        latencyMs: Date.now() - startedAt,
        errorMessage: "Tool call limit reached",
      });
      return toolLimitReachedResult();
    }
    const gate = await gateToolExecution({
      startedAt,
      toolSource: "custom",
      toolId: customTool.id,
      toolName: customTool.name,
      riskLevel: binding.riskLevel,
      toolInput,
      bindingRequiresApproval: binding.requireApproval,
    });
    if (gate.status === TOOL_GATE_RETURN) return gate.output;

    try {
      const output = await executeCustomToolWorkflow({
        workspaceId: input.workspaceId,
        userId: input.userId,
        customToolId: customTool.id,
        toolInput,
      });
      await logToolInvocation({
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        toolSource: "custom",
        toolId: customTool.id,
        toolName: customTool.name,
        riskLevel: binding.riskLevel,
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
        toolSource: "custom",
        toolId: customTool.id,
        toolName: customTool.name,
        riskLevel: binding.riskLevel,
        input: toolInput,
        status: "failed",
        latencyMs: Date.now() - startedAt,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}
