import {
  chatTodoListInputSchema,
  createChatTodoList,
} from "@/modules/chat/todo-list";
import type { ChatAttachment } from "@/modules/chat/attachments";
import { getKnowledgeBindingsForVersion } from "@/modules/knowledge/use-cases";
import { loadBoundSkillContent } from "@/modules/skills/use-cases";
import { type AiHubToolApprovalPolicy } from "@/modules/tool/approval-policy";
import { getBuiltInTool, requiresApproval } from "@/modules/tool/builtin-tools";
import { getOrganizationBuiltInToolPolicyMap } from "@/modules/tool/organization-builtin-tool-policies";
import {
  canExecuteRestrictedTool,
  getAvailableCustomToolContext,
  getAvailableMcpToolContext,
  getCustomBindingContext,
  getMcpBindingContext,
  getToolBindingsForVersion,
} from "@/modules/tool/use-cases";
import { jsonSchema, type ToolSet } from "ai";
import { z } from "zod";
import {
  buildExternalToolKey,
  createCustomToolExecute,
} from "./route-support.build-external-tool-key";
import { createBoundToolApproval } from "./route-support.bound-tool-approval";
import {
  BUILTIN_TOOL_SOURCE,
  BoundToolApprovalMetadata,
  ToolApprovalRequiredEvent,
} from "./route-support.chat-request-schema";
import { createBuiltinToolExecute } from "./route-support.create-builtin-tool-execute";
import { createMcpToolExecute } from "./route-support.create-mcp-tool-execute";
import {
  legacyWorkspaceToolNames,
  registerGovernedUnifiedCodeWorkspaceTools,
} from "./route-support.unified-code-tools";
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
  enabledTools?: Array<{ source: "builtin" | "mcp" | "custom"; id: string }>;
  enabledSkillIds?: ReadonlySet<string>;
  enabledKnowledgeIds?: string[];
  enableDocumentExplorer?: boolean;
  codeWorkspaceId?: string;
  availableAttachments?: ChatAttachment[];
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
      additionalKnowledgeBaseIds: input.enabledKnowledgeIds,
    }),
  ]);
  const enabledToolKeys = new Set(
    input.enabledTools?.map((tool) => `${tool.source}:${tool.id}`) ?? [],
  );
  const boundKeys = new Set(
    bindings.map((binding) => `${binding.toolSource}:${binding.toolId}`),
  );
  const runtimeBindings = [...bindings];
  for (const tool of input.enabledTools ?? []) {
    if (boundKeys.has(`${tool.source}:${tool.id}`)) continue;
    runtimeBindings.push({
      id: crypto.randomUUID(),
      agentVersionId: input.agentVersionId,
      toolSource: tool.source,
      toolId: tool.id,
      requireApproval: true,
      riskLevel: null,
      createdAt: new Date(),
    });
  }
  const tools: ToolSet = {};
  const usedToolKeys = new Set<string>();
  const toolApprovalMetadata = new Map<string, BoundToolApprovalMetadata>();
  const { reserveToolCall, toolLimitReachedResult, gateToolExecution } =
    createToolExecutionContext(input);
  const legacyWorkspaceBindings = runtimeBindings.flatMap((binding) => {
    if (binding.toolSource !== BUILTIN_TOOL_SOURCE) return [];
    if (
      input.disabledToolKeys?.has(`${binding.toolSource}:${binding.toolId}`)
    ) {
      return [];
    }
    const definition = getBuiltInTool(binding.toolId);
    return definition && legacyWorkspaceToolNames.has(definition.name)
      ? [{ binding, definition }]
      : [];
  });
  const useUnifiedCodeRuntime =
    Boolean(input.codeWorkspaceId) ||
    legacyWorkspaceBindings.length > 0 ||
    Boolean(input.enableDocumentExplorer);
  let dispose: () => Promise<void> = async () => {};

  function registerToolApprovalMetadata(
    toolKey: string,
    metadata: BoundToolApprovalMetadata,
  ) {
    toolApprovalMetadata.set(toolKey, metadata);
  }

  if (!input.codeWorkspaceId) {
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
  }
  if (input.hasSkills && !input.codeWorkspaceId) {
    registerToolApprovalMetadata("load_skill", {
      toolSource: BUILTIN_TOOL_SOURCE,
      toolName: "load_skill",
      riskLevel: "low",
    });
    usedToolKeys.add("load_skill");
    tools.load_skill = {
      description:
        "Load the full Markdown instructions for an enabled agent skill by exact skill name. Use this when a listed skill is relevant before applying its workflow.",
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
        const parsed = z
          .object({ skillName: z.string().trim().min(1) })
          .safeParse(toolInput);
        if (!parsed.success) {
          return { found: false, message: "skillName is required." };
        }
        return loadBoundSkillContent({
          agentVersionId: input.agentVersionId,
          skillName: parsed.data.skillName,
          disabledSkillIds: input.disabledSkillIds,
          enabledSkillIds: input.enabledSkillIds,
          workspaceId: input.workspaceId,
          userId: input.userId,
        });
      },
    };
  }

  for (const binding of runtimeBindings) {
    if (input.codeWorkspaceId) continue;
    if (
      input.disabledToolKeys?.has(`${binding.toolSource}:${binding.toolId}`)
    ) {
      continue;
    }
    if (binding.toolSource === "custom") {
      const customContext =
        enabledToolKeys.has(`custom:${binding.toolId}`) &&
        !boundKeys.has(`custom:${binding.toolId}`)
          ? await getAvailableCustomToolContext(
              binding.toolId,
              input.userId,
              input.workspaceId,
            )
          : await getCustomBindingContext(
              input.agentVersionId,
              binding.toolId,
              input.userId,
              input.workspaceId,
            );
      if (!customContext) continue;
      const customTool = customContext.tool;
      const toolKey = buildExternalToolKey({
        source: "custom",
        toolId: customTool.id,
        toolName: customTool.name,
        usedKeys: usedToolKeys,
      });
      const schema = (customTool.inputSchemaJson as Record<
        string,
        unknown
      > | null) ?? { type: "object", properties: {} };
      registerToolApprovalMetadata(toolKey, {
        toolSource: "custom",
        toolName: customTool.name,
        riskLevel: binding.riskLevel,
        bindingRequiresApproval: binding.requireApproval,
      });

      tools[toolKey] = {
        description:
          customTool.description ??
          `Custom tool ${customTool.name} created by the current user.`,
        inputSchema: jsonSchema(schema),
        execute: createCustomToolExecute(
          input,
          customTool,
          binding,
          reserveToolCall,
          toolLimitReachedResult,
          gateToolExecution,
        ),
      };
      continue;
    }

    if (binding.toolSource === "mcp") {
      const mcpContext =
        enabledToolKeys.has(`mcp:${binding.toolId}`) &&
        !boundKeys.has(`mcp:${binding.toolId}`)
          ? await getAvailableMcpToolContext(
              binding.toolId,
              input.userId,
              input.workspaceId,
            )
          : await getMcpBindingContext(
              input.agentVersionId,
              binding.toolId,
              input.userId,
              input.workspaceId,
            );
      if (!mcpContext) continue;
      const mcpTool = mcpContext.tool;

      const toolKey = buildExternalToolKey({
        source: "mcp",
        toolId: mcpTool.id,
        toolName: mcpTool.name,
        usedKeys: usedToolKeys,
      });
      const schema = (mcpTool.inputSchemaJson as Record<
        string,
        unknown
      > | null) ?? {
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
        description:
          mcpTool.description ??
          `MCP tool ${mcpTool.name} from connected server.`,
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
    if (
      useUnifiedCodeRuntime &&
      legacyWorkspaceToolNames.has(definition.name)
    ) {
      continue;
    }
    const organizationPolicy = builtInPolicies.get(definition.name);
    if (organizationPolicy?.enabled === false) continue;
    const effectiveBinding = {
      ...binding,
      requireApproval:
        organizationPolicy?.requireApproval ??
        requiresApproval(definition.riskLevel),
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
      execute: createBuiltinToolExecute(
        input,
        definition,
        effectiveBinding,
        reserveToolCall,
        toolLimitReachedResult,
        gateToolExecution,
        canExecuteRestrictedTool,
      ),
    };
  }

  if (!useUnifiedCodeRuntime) {
    tools.update_todo_list = {
      description:
        "Create or replace the visible to-do list for this task. Use stable item IDs and call this tool again whenever an item starts or completes so the user can follow progress live.",
      inputSchema: chatTodoListInputSchema,
      execute: async (toolInput: unknown) => {
        if (!reserveToolCall()) return toolLimitReachedResult();
        return createChatTodoList(toolInput);
      },
    };
  }

  if (useUnifiedCodeRuntime) {
    dispose = registerGovernedUnifiedCodeWorkspaceTools({
      tools,
      workspaceId: input.workspaceId,
      userId: input.userId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      projectId: input.codeWorkspaceId,
      attachments: input.availableAttachments,
      durable:
        Boolean(input.codeWorkspaceId) ||
        legacyWorkspaceBindings.some(({ definition }) =>
          definition.name.startsWith("code_workspace_"),
        ),
      nonInteractive: input.nonInteractive,
      legacyBindings: legacyWorkspaceBindings,
      builtInPolicies,
      disabledToolKeys: input.disabledToolKeys,
      emitEvent: input.emitEvent,
      reserveToolCall,
      toolLimitReachedResult,
      gateToolExecution,
    });
  }

  const toolApproval = createBoundToolApproval(input, toolApprovalMetadata);

  return { tools, toolApproval, dispose };
}
