import { readBoundKnowledgeChunkWindow,searchBoundKnowledgeBases } from "@/modules/knowledge/use-cases";
import { logToolInvocation } from "@/modules/tool/use-cases";
import { jsonSchema,type ToolSet } from "ai";
import { z } from "zod";

import type { BuildBoundToolsInput } from "./route-support.build-bound-tools";
import { BUILTIN_TOOL_SOURCE,KNOWLEDGE_CONTEXT_TOOL_ID,KNOWLEDGE_CONTEXT_TOOL_NAME,KNOWLEDGE_SEARCH_TOOL_ID,KNOWLEDGE_SEARCH_TOOL_NAME,TOOL_GATE_RETURN,type BoundToolApprovalMetadata } from "./route-support.chat-request-schema";
import type { GateToolExecution } from "./route-support.tool-execution-context";

type KnowledgeBinding = Awaited<ReturnType<typeof import("@/modules/knowledge/use-cases").getKnowledgeBindingsForVersion>>[number];

export function registerKnowledgeTools(context: { input: BuildBoundToolsInput; knowledgeBindings: KnowledgeBinding[]; tools: ToolSet; usedToolKeys: Set<string>; registerToolApprovalMetadata: (toolKey: string, metadata: BoundToolApprovalMetadata) => void; reserveToolCall: () => boolean; toolLimitReachedResult: () => { denied: boolean; message: string }; gateToolExecution: GateToolExecution }) {
  const { input, knowledgeBindings, tools, usedToolKeys, registerToolApprovalMetadata, reserveToolCall, toolLimitReachedResult, gateToolExecution } = context;
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
}
