import type { JSONSchema7, JSONValue } from "@ai-sdk/provider";
import {
  dynamicTool,
  jsonSchema,
  Output,
  type ModelMessage,
  type ToolChoice,
  type ToolSet,
} from "ai";

import type { AnthropicMessagesRequest } from "@/modules/anthropic-proxy/contracts";
import { invalidRequest } from "@/modules/openai-proxy/errors";
import type { PreparedProxyGeneration } from "@/modules/openai-proxy/request-mapper";

function systemText(system: AnthropicMessagesRequest["system"]) {
  if (!system) return undefined;
  return typeof system === "string"
    ? system
    : system.map((block) => block.text).join("\n");
}

function toolResultText(
  content: string | Array<{ type: "text"; text: string }> | undefined,
) {
  if (typeof content === "string") return content;
  return content?.map((block) => block.text).join("\n") ?? "";
}

function anthropicMessages(request: AnthropicMessagesRequest): ModelMessage[] {
  const toolNames = new Map<string, string>();
  const messages: ModelMessage[] = [];
  const system = systemText(request.system);
  if (system) messages.push({ role: "system", content: system });

  for (const [messageIndex, message] of request.messages.entries()) {
    if (typeof message.content === "string") {
      messages.push({ role: message.role, content: message.content });
      continue;
    }
    if (message.role === "assistant") {
      const content: Array<
        | { type: "text"; text: string }
        | {
            type: "tool-call";
            toolCallId: string;
            toolName: string;
            input: unknown;
          }
      > = [];
      for (const block of message.content) {
        if (block.type === "text") content.push(block);
        if (block.type === "tool_use") {
          toolNames.set(block.id, block.name);
          content.push({
            type: "tool-call",
            toolCallId: block.id,
            toolName: block.name,
            input: block.input,
          });
        }
        if (block.type !== "text" && block.type !== "tool_use") {
          throw invalidRequest(
            `Unsupported assistant content block '${block.type}'.`,
            `messages.${messageIndex}.content`,
          );
        }
      }
      messages.push({ role: "assistant", content });
      continue;
    }

    const userContent: Array<
      | { type: "text"; text: string }
      | { type: "file"; data: string | URL; mediaType: string }
    > = [];
    const toolResults: ModelMessage[] = [];
    for (const [blockIndex, block] of message.content.entries()) {
      if (block.type === "text") userContent.push(block);
      else if (block.type === "image") {
        userContent.push({
          type: "file",
          data:
            block.source.type === "url"
              ? new URL(block.source.url)
              : block.source.data,
          mediaType:
            block.source.type === "url" ? "image/*" : block.source.media_type,
        });
      } else if (block.type === "tool_result") {
        const toolName = toolNames.get(block.tool_use_id);
        if (!toolName) {
          throw invalidRequest(
            `No matching tool_use was found for '${block.tool_use_id}'.`,
            `messages.${messageIndex}.content.${blockIndex}.tool_use_id`,
          );
        }
        toolResults.push({
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: block.tool_use_id,
              toolName,
              output: {
                type: "text",
                value: toolResultText(block.content),
              },
            },
          ],
        });
      } else {
        throw invalidRequest(
          `Unsupported user content block '${block.type}'.`,
          `messages.${messageIndex}.content.${blockIndex}`,
        );
      }
    }
    if (userContent.length > 0)
      messages.push({ role: "user", content: userContent });
    messages.push(...toolResults);
  }
  return messages;
}

function toolsFrom(request: AnthropicMessagesRequest): ToolSet | undefined {
  if (!request.tools?.length) return undefined;
  return Object.fromEntries(
    request.tools.map((tool) => [
      tool.name,
      dynamicTool({
        description: tool.description,
        inputSchema: jsonSchema(tool.input_schema as JSONSchema7),
      }),
    ]),
  );
}

function toolChoiceFrom(
  request: AnthropicMessagesRequest,
): ToolChoice<ToolSet> | undefined {
  const choice = request.tool_choice;
  if (!choice || choice.type === "auto") return "auto";
  if (choice.type === "any") return "required";
  if (choice.type === "none") return "none";
  return { type: "tool", toolName: choice.name };
}

export function prepareAnthropicMessages(
  request: AnthropicMessagesRequest,
): PreparedProxyGeneration {
  const tools = toolsFrom(request);
  const toolChoice = toolChoiceFrom(request);
  if (
    toolChoice &&
    typeof toolChoice !== "string" &&
    !tools?.[toolChoice.toolName]
  ) {
    throw invalidRequest(
      `Tool choice '${toolChoice.toolName}' was not found in tools.`,
      "tool_choice",
      "unknown_tool",
    );
  }
  const disableParallelToolUse =
    request.tool_choice && "disable_parallel_tool_use" in request.tool_choice
      ? request.tool_choice.disable_parallel_tool_use
      : undefined;
  return {
    messages: anthropicMessages(request),
    tools,
    toolChoice,
    output: Output.text(),
    responseFormat: { type: "text" },
    maxOutputTokens: request.max_tokens,
    temperature: request.temperature,
    topP: request.top_p,
    topK: request.top_k,
    presencePenalty: undefined,
    frequencyPenalty: undefined,
    seed: undefined,
    stopSequences: request.stop_sequences,
    providerOptions: {
      user: request.metadata?.user_id ?? undefined,
      parallelToolCalls:
        disableParallelToolUse === undefined
          ? undefined
          : !disableParallelToolUse,
    } satisfies Record<string, JSONValue | undefined>,
  };
}
