import { chatTodoListInputSchema,createChatTodoList } from "@/modules/chat/todo-list";
import { getKnowledgeBindingsForVersion } from "@/modules/knowledge/use-cases";
import { loadBoundSkillContent } from "@/modules/skills/use-cases";
import { decideToolApproval,type AiHubToolApprovalPolicy } from "@/modules/tool/approval-policy";
import { getBuiltInTool,getBuiltInToolByName,requiresApproval } from "@/modules/tool/builtin-tools";
import { evaluateOpaToolApprovalPolicy } from "@/modules/tool/opa-approval-policy";
import { getOrganizationBuiltInToolPolicyMap } from "@/modules/tool/organization-builtin-tool-policies";
import { canExecuteRestrictedTool,getCustomBindingContext,getMcpBindingContext,getToolBindingsForVersion } from "@/modules/tool/use-cases";
import { jsonSchema,type ToolApprovalConfiguration,type ToolSet } from "ai";
import { z } from "zod";
import { buildExternalToolKey,createCustomToolExecute } from "./route-support.build-external-tool-key";
import { BUILTIN_TOOL_SOURCE,BoundToolApprovalMetadata,ToolApprovalRequiredEvent } from "./route-support.chat-request-schema";
import { createBuiltinToolExecute } from "./route-support.create-builtin-tool-execute";
import { createMcpToolExecute } from "./route-support.create-mcp-tool-execute";
import { registerKnowledgeTools } from "./route-support.knowledge-tools";
import { createToolExecutionContext } from "./route-support.tool-execution-context";

export type BuildBoundToolsInput = {
  agentVersionId: string;
  workspaceId: string;
  conversationId?: string;
  messageId?: string;
  userId: string;
  maxToolCalls: number;
  nonInteractive?: boolean;
  approvalPolicy?: AiHubToolApprovalPolicy | null;
  hasSkills?: boolean;
  disabledToolKeys?: ReadonlySet<string>;
  disabledSkillIds?: ReadonlySet<string>;
  enableDocumentExplorer?: boolean;
  emitEvent?: (event: Record<string, unknown>) => void;
  onApprovalRequired?: (event: ToolApprovalRequiredEvent) => void;
};

export async function buildBoundTools(input: BuildBoundToolsInput) {
  const [bindings, builtInPolicies, knowledgeBindings] = await Promise.all([
    getToolBindingsForVersion(input.agentVersionId),
    getOrganizationBuiltInToolPolicyMap(input.workspaceId),
    getKnowledgeBindingsForVersion(input.agentVersionId, {
      workspaceId: input.workspaceId,
      userId: input.userId,
    }),
  ]);
  const tools: ToolSet = {};
  const usedToolKeys = new Set<string>();
  const toolApprovalMetadata = new Map<string, BoundToolApprovalMetadata>();
  const { reserveToolCall, toolLimitReachedResult, gateToolExecution } = createToolExecutionContext(input);

  function registerToolApprovalMetadata(toolKey: string, metadata: BoundToolApprovalMetadata) {
    toolApprovalMetadata.set(toolKey, metadata);
  }

  registerKnowledgeTools({
    input,
    knowledgeBindings,
    tools,
    usedToolKeys,
    registerToolApprovalMetadata,
    reserveToolCall,
    toolLimitReachedResult,
    gateToolExecution,
  });
  if (input.hasSkills) {
    registerToolApprovalMetadata("load_skill", {
      toolSource: BUILTIN_TOOL_SOURCE,
      toolName: "load_skill",
      riskLevel: "low",
    });
    usedToolKeys.add("load_skill");
    tools.load_skill = {
      description: "Load the full Markdown instructions for an enabled agent skill by exact skill name. Use this when a listed skill is relevant before applying its workflow.",
      inputSchema: jsonSchema({
        type: "object",
        properties: {
          skillName: {
            type: "string",
            description: "Exact skill name from the available skills registry.",
          },
        },
        required: ["skillName"],
        additionalProperties: false,
      }),
      execute: async (toolInput: unknown) => {
        if (!reserveToolCall()) return toolLimitReachedResult();
        const parsed = z.object({ skillName: z.string().trim().min(1) }).safeParse(toolInput);
        if (!parsed.success) {
          return { found: false, message: "skillName is required." };
        }
        return loadBoundSkillContent({
          agentVersionId: input.agentVersionId,
          skillName: parsed.data.skillName,
          disabledSkillIds: input.disabledSkillIds,
        });
      },
    };
  }

  for (const binding of bindings) {
    if (input.disabledToolKeys?.has(`${binding.toolSource}:${binding.toolId}`)) {
      continue;
    }
    if (binding.toolSource === "custom") {
      const customContext = await getCustomBindingContext(input.agentVersionId, binding.toolId, input.userId, input.workspaceId);
      if (!customContext) continue;
      const customTool = customContext.tool;
      const toolKey = buildExternalToolKey({
        source: "custom",
        toolId: customTool.id,
        toolName: customTool.name,
        usedKeys: usedToolKeys,
      });
      const schema = (customTool.inputSchemaJson as Record<string, unknown> | null) ?? { type: "object", properties: {} };
      registerToolApprovalMetadata(toolKey, {
        toolSource: "custom",
        toolName: customTool.name,
        riskLevel: binding.riskLevel,
        bindingRequiresApproval: binding.requireApproval,
      });

      tools[toolKey] = {
        description: customTool.description ?? `Custom tool ${customTool.name} created by the current user.`,
        inputSchema: jsonSchema(schema),
        execute: createCustomToolExecute(input, customTool, binding, reserveToolCall, toolLimitReachedResult, gateToolExecution),
      };
      continue;
    }

    if (binding.toolSource === "mcp") {
      const mcpContext = await getMcpBindingContext(input.agentVersionId, binding.toolId, input.userId, input.workspaceId);
      if (!mcpContext) continue;
      const mcpTool = mcpContext.tool;

      const toolKey = buildExternalToolKey({
        source: "mcp",
        toolId: mcpTool.id,
        toolName: mcpTool.name,
        usedKeys: usedToolKeys,
      });
      const schema = (mcpTool.inputSchemaJson as Record<string, unknown> | null) ?? {
        type: "object",
        properties: {},
      };
      registerToolApprovalMetadata(toolKey, {
        toolSource: "mcp",
        toolName: mcpTool.name,
        riskLevel: binding.riskLevel,
        bindingRequiresApproval: binding.requireApproval,
        serverRequiresApproval: mcpContext.server.requireApproval,
        toolRequiresApproval: mcpTool.requireApproval,
      });

      tools[toolKey] = {
        description: mcpTool.description ?? `MCP tool ${mcpTool.name} from connected server.`,
        inputSchema: jsonSchema(schema),
        execute: createMcpToolExecute(
          input,
          mcpTool,
          binding,
          {
            serverRequiresApproval: mcpContext.server.requireApproval,
            toolRequiresApproval: mcpTool.requireApproval,
          },
          reserveToolCall,
          toolLimitReachedResult,
          gateToolExecution,
        ),
      };
      continue;
    }

    if (binding.toolSource !== BUILTIN_TOOL_SOURCE) continue;
    const definition = getBuiltInTool(binding.toolId);
    if (!definition) continue;
    const organizationPolicy = builtInPolicies.get(definition.name);
    if (organizationPolicy?.enabled === false) continue;
    const effectiveBinding = {
      ...binding,
      requireApproval: organizationPolicy?.requireApproval ?? requiresApproval(definition.riskLevel),
    };
    registerToolApprovalMetadata(definition.name, {
      toolSource: BUILTIN_TOOL_SOURCE,
      toolName: definition.name,
      riskLevel: definition.riskLevel,
      bindingRequiresApproval: effectiveBinding.requireApproval,
      skipDefaultRiskApproval: true,
    });

    usedToolKeys.add(definition.name);
    tools[definition.name] = {
      description: `${definition.description} Risk level: ${definition.riskLevel}.`,
      inputSchema: definition.inputSchema,
      execute: createBuiltinToolExecute(input, definition, effectiveBinding, reserveToolCall, toolLimitReachedResult, gateToolExecution, canExecuteRestrictedTool),
    };
  }

  if (input.enableDocumentExplorer && !tools.run_code_sandbox) {
    const definition = getBuiltInToolByName("run_code_sandbox");
    const organizationPolicy = builtInPolicies.get("run_code_sandbox");
    if (definition && organizationPolicy?.enabled !== false && !input.disabledToolKeys?.has(`${BUILTIN_TOOL_SOURCE}:${definition.id}`)) {
      const requireApproval = organizationPolicy?.requireApproval ?? requiresApproval(definition.riskLevel);
      registerToolApprovalMetadata(definition.name, {
        toolSource: BUILTIN_TOOL_SOURCE,
        toolName: definition.name,
        riskLevel: definition.riskLevel,
        bindingRequiresApproval: requireApproval,
        skipDefaultRiskApproval: true,
      });
      usedToolKeys.add(definition.name);
      tools[definition.name] = {
        description: `${definition.description} Automatically enabled for embedding-free document exploration. Risk level: ${definition.riskLevel}.`,
        inputSchema: definition.inputSchema,
        execute: createBuiltinToolExecute(input, definition, { riskLevel: definition.riskLevel, requireApproval }, reserveToolCall, toolLimitReachedResult, gateToolExecution, canExecuteRestrictedTool),
      };
    }
  }

  tools.update_todo_list = {
    description: "Create or replace the visible to-do list for this task. Use stable item IDs and call this tool again whenever an item starts or completes so the user can follow progress live.",
    inputSchema: chatTodoListInputSchema,
    execute: async (toolInput: unknown) => {
      if (!reserveToolCall()) return toolLimitReachedResult();
      return createChatTodoList(toolInput);
    },
  };

  const toolApproval: ToolApprovalConfiguration<ToolSet, Record<string, unknown>> = async ({ toolCall }) => {
    const metadata = toolApprovalMetadata.get(toolCall.toolName);
    if (!metadata) return undefined;
    const decision =
      (await evaluateOpaToolApprovalPolicy({
        toolName: metadata.toolName,
        toolSource: metadata.toolSource,
        riskLevel: metadata.riskLevel,
        toolInput: toolCall.input,
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        userId: input.userId,
        agentVersionId: input.agentVersionId,
      })) ??
      decideToolApproval({
        policy: input.approvalPolicy,
        ...metadata,
      });
    // Keep human approvals in Maiah's existing DB-audited, streaming approval
    // flow. Native AI SDK approval is used here for hard policy denials so the
    // model receives a standard denied tool output before execution can start.
    return decision.status === "deny" ? decision.aiSdkStatus : undefined;
  };

  return { tools, toolApproval };
}
