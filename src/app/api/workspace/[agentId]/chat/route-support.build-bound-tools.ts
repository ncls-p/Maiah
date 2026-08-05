import { chatTodoListInputSchema,createChatTodoList } from "@/modules/chat/todo-list";
import { getKnowledgeBindingsForVersion,readBoundKnowledgeChunkWindow,searchBoundKnowledgeBases } from "@/modules/knowledge/use-cases";
import { loadBoundSkillContent } from "@/modules/skills/use-cases";
import { decideToolApproval,type AiHubToolApprovalPolicy } from "@/modules/tool/approval-policy";
import { getBuiltInTool,getBuiltInToolByName,requiresApproval } from "@/modules/tool/builtin-tools";
import { waitForApproval } from "@/modules/tool/invocation-state";
import { evaluateOpaToolApprovalPolicy } from "@/modules/tool/opa-approval-policy";
import { getOrganizationBuiltInToolPolicyMap } from "@/modules/tool/organization-builtin-tool-policies";
import { projectToolPayloadForDisplay } from "@/modules/tool/safe-payload";
import { canExecuteRestrictedTool,getCustomBindingContext,getMcpBindingContext,getToolBindingsForVersion,logToolInvocation } from "@/modules/tool/use-cases";
import { jsonSchema,type ToolApprovalConfiguration,type ToolSet } from "ai";
import { z } from "zod";
import { buildExternalToolKey,createCustomToolExecute } from "./route-support.build-external-tool-key";
import { BUILTIN_TOOL_SOURCE,BoundToolApprovalMetadata,KNOWLEDGE_CONTEXT_TOOL_ID,KNOWLEDGE_CONTEXT_TOOL_NAME,KNOWLEDGE_SEARCH_TOOL_ID,KNOWLEDGE_SEARCH_TOOL_NAME,TOOL_GATE_RETURN,ToolApprovalRequiredEvent,ToolGateResult } from "./route-support.chat-request-schema";
import { createBuiltinToolExecute } from "./route-support.create-builtin-tool-execute";
import { createMcpToolExecute } from "./route-support.create-mcp-tool-execute";

export async function buildBoundTools(input: { agentVersionId: string; workspaceId: string; conversationId?: string; messageId?: string; userId: string; maxToolCalls: number; nonInteractive?: boolean; approvalPolicy?: AiHubToolApprovalPolicy | null; hasSkills?: boolean; disabledToolKeys?: ReadonlySet<string>; disabledSkillIds?: ReadonlySet<string>; enableDocumentExplorer?: boolean; emitEvent?: (event: Record<string, unknown>) => void; onApprovalRequired?: (event: ToolApprovalRequiredEvent) => void }) {
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
  let executedToolCallCount = 0;

  function registerToolApprovalMetadata(toolKey: string, metadata: BoundToolApprovalMetadata) {
    toolApprovalMetadata.set(toolKey, metadata);
  }

  function reserveToolCall() {
    if (executedToolCallCount >= input.maxToolCalls) return false;
    executedToolCallCount += 1;
    return true;
  }

  function toolLimitReachedResult() {
    return {
      denied: true,
      message: "Tool call limit reached. Answer the user now using the information already gathered.",
    };
  }

  async function executeKnowledgeTool(inputArgs: { toolId: string; toolName: string; toolInput: unknown; execute: () => Promise<unknown> }) {
    const startedAt = Date.now();
    if (!reserveToolCall()) {
      await logToolInvocation({
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        toolSource: BUILTIN_TOOL_SOURCE,
        toolId: inputArgs.toolId,
        toolName: inputArgs.toolName,
        riskLevel: "low",
        input: inputArgs.toolInput,
        status: "denied",
        latencyMs: Date.now() - startedAt,
        errorMessage: "Tool call limit reached",
      });
      return toolLimitReachedResult();
    }
    const gate = await gateToolExecution({
      startedAt,
      toolSource: BUILTIN_TOOL_SOURCE,
      toolId: inputArgs.toolId,
      toolName: inputArgs.toolName,
      riskLevel: "low",
      toolInput: inputArgs.toolInput,
      bindingRequiresApproval: false,
    });
    if (gate.status === TOOL_GATE_RETURN) return gate.output;

    try {
      const output = await inputArgs.execute();
      await logToolInvocation({
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        toolSource: BUILTIN_TOOL_SOURCE,
        toolId: inputArgs.toolId,
        toolName: inputArgs.toolName,
        riskLevel: "low",
        input: inputArgs.toolInput,
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
        toolId: inputArgs.toolId,
        toolName: inputArgs.toolName,
        riskLevel: "low",
        input: inputArgs.toolInput,
        status: "failed",
        latencyMs: Date.now() - startedAt,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  usedToolKeys.add("update_todo_list");

  async function gateToolExecution(inputArgs: { startedAt: number; toolSource: typeof BUILTIN_TOOL_SOURCE | "custom" | "mcp"; toolId: string; toolName: string; riskLevel?: string | null; toolInput: unknown; bindingRequiresApproval?: boolean; serverRequiresApproval?: boolean; toolRequiresApproval?: boolean }): Promise<ToolGateResult> {
    const decision =
      (await evaluateOpaToolApprovalPolicy({
        toolName: inputArgs.toolName,
        toolSource: inputArgs.toolSource,
        riskLevel: inputArgs.riskLevel,
        toolInput: inputArgs.toolInput,
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        userId: input.userId,
        agentVersionId: input.agentVersionId,
      })) ??
      decideToolApproval({
        policy: input.approvalPolicy,
        toolName: inputArgs.toolName,
        toolSource: inputArgs.toolSource,
        riskLevel: inputArgs.riskLevel,
        bindingRequiresApproval: inputArgs.bindingRequiresApproval,
        serverRequiresApproval: inputArgs.serverRequiresApproval,
        toolRequiresApproval: inputArgs.toolRequiresApproval,
        skipDefaultRiskApproval: inputArgs.toolSource === BUILTIN_TOOL_SOURCE,
      });

    if (decision.status === "allow") return { status: "continue" };

    if (decision.status === "deny") {
      await logToolInvocation({
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        toolSource: inputArgs.toolSource,
        toolId: inputArgs.toolId,
        toolName: inputArgs.toolName,
        riskLevel: inputArgs.riskLevel,
        input: inputArgs.toolInput,
        status: "denied",
        latencyMs: Date.now() - inputArgs.startedAt,
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
        toolSource: inputArgs.toolSource,
        toolId: inputArgs.toolId,
        toolName: inputArgs.toolName,
        riskLevel: inputArgs.riskLevel,
        input: inputArgs.toolInput,
        status: "denied",
        latencyMs: Date.now() - inputArgs.startedAt,
        errorMessage: "Human approval is unavailable for this run",
      });
      return {
        status: TOOL_GATE_RETURN,
        output: {
          denied: true,
          message: "This tool requires human approval and cannot run in a delegated, scheduled, or API execution.",
        },
      };
    }

    const invocation = await logToolInvocation({
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      toolSource: inputArgs.toolSource,
      toolId: inputArgs.toolId,
      toolName: inputArgs.toolName,
      riskLevel: inputArgs.riskLevel,
      input: inputArgs.toolInput,
      status: "awaiting_approval",
      latencyMs: Date.now() - inputArgs.startedAt,
    });

    input.onApprovalRequired?.({
      invocationId: invocation.id,
      toolName: inputArgs.toolName,
      input: projectToolPayloadForDisplay(inputArgs.toolInput),
    });

    const approvalResult = await waitForApproval(invocation.id);
    if (approvalResult.status === "success") {
      return { status: TOOL_GATE_RETURN, output: approvalResult.output };
    }

    return {
      status: TOOL_GATE_RETURN,
      output: {
        denied: true,
        invocationId: invocation.id,
        message: approvalResult.error ?? "Tool invocation was not approved.",
      },
    };
  }

  if (knowledgeBindings.length > 0) {
    const sourceIds = new Set(knowledgeBindings.map((binding) => binding.knowledgeBaseId));
    const sourceCatalog = knowledgeBindings.map((binding) => `- ${binding.name} (${binding.knowledgeBaseId}): ${binding.description?.trim().slice(0, 400) || "No description provided."}`).join("\n");

    if (!input.disabledToolKeys?.has(`${BUILTIN_TOOL_SOURCE}:${KNOWLEDGE_SEARCH_TOOL_ID}`)) {
      registerToolApprovalMetadata(KNOWLEDGE_SEARCH_TOOL_NAME, {
        toolSource: BUILTIN_TOOL_SOURCE,
        toolName: KNOWLEDGE_SEARCH_TOOL_NAME,
        riskLevel: "low",
        bindingRequiresApproval: false,
        skipDefaultRiskApproval: true,
      });
      usedToolKeys.add(KNOWLEDGE_SEARCH_TOOL_NAME);
      tools[KNOWLEDGE_SEARCH_TOOL_NAME] = {
        description: `Search one or more data sources connected to this agent. Select the most relevant source IDs from their names and descriptions, and select multiple sources only when the request spans them. Call this only when the user's request may depend on these sources; do not search for greetings, general knowledge, or unrelated requests. Results include chunkId values that can be expanded with ${KNOWLEDGE_CONTEXT_TOOL_NAME}.\n\nAvailable data sources:\n${sourceCatalog}`,
        inputSchema: jsonSchema({
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "A focused semantic search query for the connected data sources.",
            },
            knowledgeBaseIds: {
              type: "array",
              minItems: 1,
              uniqueItems: true,
              items: {
                type: "string",
                format: "uuid",
                enum: knowledgeBindings.map((binding) => binding.knowledgeBaseId),
              },
              description: "One or more data source IDs explicitly selected from the catalog in this tool description.",
            },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 10,
              description: "Maximum number of matching chunks to return.",
            },
          },
          required: ["query", "knowledgeBaseIds"],
          additionalProperties: false,
        }),
        execute: async (toolInput: unknown) => {
          const parsed = z
            .object({
              query: z.string().trim().min(1).max(4_000),
              knowledgeBaseIds: z.array(z.uuid()).min(1).max(20),
              limit: z.number().int().min(1).max(10).default(5),
            })
            .safeParse(toolInput);
          if (!parsed.success || parsed.data.knowledgeBaseIds.some((id) => !sourceIds.has(id))) {
            return {
              kind: "knowledge_search_results",
              results: [],
              error: "A non-empty query, one or more available knowledgeBaseIds, and an optional limit from 1 to 10 are required.",
            };
          }
          return executeKnowledgeTool({
            toolId: KNOWLEDGE_SEARCH_TOOL_ID,
            toolName: KNOWLEDGE_SEARCH_TOOL_NAME,
            toolInput: parsed.data,
            execute: async () => ({
              kind: "knowledge_search_results",
              query: parsed.data.query,
              results: await searchBoundKnowledgeBases({
                agentVersionId: input.agentVersionId,
                workspaceId: input.workspaceId,
                userId: input.userId,
                knowledgeBaseIds: [...new Set(parsed.data.knowledgeBaseIds)],
                query: parsed.data.query,
                limit: parsed.data.limit,
              }),
            }),
          });
        },
      };
    }

    if (!input.disabledToolKeys?.has(`${BUILTIN_TOOL_SOURCE}:${KNOWLEDGE_CONTEXT_TOOL_ID}`)) {
      registerToolApprovalMetadata(KNOWLEDGE_CONTEXT_TOOL_NAME, {
        toolSource: BUILTIN_TOOL_SOURCE,
        toolName: KNOWLEDGE_CONTEXT_TOOL_NAME,
        riskLevel: "low",
        bindingRequiresApproval: false,
        skipDefaultRiskApproval: true,
      });
      usedToolKeys.add(KNOWLEDGE_CONTEXT_TOOL_NAME);
      tools[KNOWLEDGE_CONTEXT_TOOL_NAME] = {
        description: `Read neighboring chunks before and after a chunk returned by ${KNOWLEDGE_SEARCH_TOOL_NAME}. Use it only when the matching chunk needs surrounding context. Access remains limited to data sources connected to this agent.`,
        inputSchema: jsonSchema({
          type: "object",
          properties: {
            chunkId: {
              type: "string",
              format: "uuid",
              description: `The chunkId returned by ${KNOWLEDGE_SEARCH_TOOL_NAME}.`,
            },
            before: {
              type: "integer",
              minimum: 0,
              maximum: 5,
              description: "Number of preceding chunks to read (default 2).",
            },
            after: {
              type: "integer",
              minimum: 0,
              maximum: 5,
              description: "Number of following chunks to read (default 2).",
            },
          },
          required: ["chunkId"],
          additionalProperties: false,
        }),
        execute: async (toolInput: unknown) => {
          const parsed = z
            .object({
              chunkId: z.uuid(),
              before: z.number().int().min(0).max(5).default(2),
              after: z.number().int().min(0).max(5).default(2),
            })
            .safeParse(toolInput);
          if (!parsed.success) {
            return {
              kind: "knowledge_context",
              found: false,
              error: "A valid chunkId and before/after values from 0 to 5 are required.",
            };
          }
          return executeKnowledgeTool({
            toolId: KNOWLEDGE_CONTEXT_TOOL_ID,
            toolName: KNOWLEDGE_CONTEXT_TOOL_NAME,
            toolInput: parsed.data,
            execute: async () => {
              const context = await readBoundKnowledgeChunkWindow({
                agentVersionId: input.agentVersionId,
                workspaceId: input.workspaceId,
                userId: input.userId,
                ...parsed.data,
              });
              return context
                ? { kind: "knowledge_context", found: true, ...context }
                : {
                    kind: "knowledge_context",
                    found: false,
                    error: "The chunk is unavailable or is no longer accessible through this agent.",
                  };
            },
          });
        },
      };
    }
  }

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
