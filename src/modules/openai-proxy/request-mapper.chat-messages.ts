import type { JSONSchema7, JSONValue } from "@ai-sdk/provider";
import {
  dynamicTool,
  jsonSchema,
  Output,
  type ModelMessage,
  type ToolChoice,
  type ToolSet,
} from "ai";

import type {
  ChatCompletionRequest,
  FunctionDefinition,
  ProxyResponseFormat,
  ProxyToolChoice,
  ResponsesRequest,
} from "@/modules/openai-proxy/contracts";
import { invalidRequest } from "@/modules/openai-proxy/errors";
import {
  objectValue,
  parseJson,
  stringValue,
  textContent,
  toolResultOutput,
  userContent,
} from "./request-mapper.prepared-proxy-generation";

export function chatMessages(request: ChatCompletionRequest): ModelMessage[] {
  const toolNames = new Map<string, string>();
  let lastLegacyFunctionCallId: string | undefined;

  return request.messages.map((message, index): ModelMessage => {
    const param = `messages.${index}`;
    if (message.role === "system" || message.role === "developer") {
      return {
        role: "system",
        content: textContent(message.content, `${param}.content`),
      };
    }
    if (message.role === "user") {
      return {
        role: "user",
        content: userContent(message.content, `${param}.content`),
      };
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
      if (message.content != null) {
        const text = textContent(message.content, `${param}.content`);
        if (text) content.push({ type: "text", text });
      }
      if (message.tool_calls != null) {
        if (!Array.isArray(message.tool_calls)) {
          throw invalidRequest(
            `Expected an array for '${param}.tool_calls'.`,
            `${param}.tool_calls`,
          );
        }
        for (const [toolIndex, value] of message.tool_calls.entries()) {
          const toolCall = objectValue(
            value,
            `${param}.tool_calls.${toolIndex}`,
          );
          const fn = objectValue(
            toolCall.function,
            `${param}.tool_calls.${toolIndex}.function`,
          );
          const id = stringValue(
            toolCall.id,
            `${param}.tool_calls.${toolIndex}.id`,
          );
          const name = stringValue(
            fn.name,
            `${param}.tool_calls.${toolIndex}.function.name`,
          );
          toolNames.set(id, name);
          content.push({
            type: "tool-call",
            toolCallId: id,
            toolName: name,
            input: parseJson(
              stringValue(
                fn.arguments,
                `${param}.tool_calls.${toolIndex}.function.arguments`,
              ),
              `${param}.tool_calls.${toolIndex}.function.arguments`,
            ),
          });
        }
      }
      if (message.function_call != null) {
        const fn = objectValue(message.function_call, `${param}.function_call`);
        const id = `call_legacy_${index}`;
        const name = stringValue(fn.name, `${param}.function_call.name`);
        toolNames.set(id, name);
        lastLegacyFunctionCallId = id;
        content.push({
          type: "tool-call",
          toolCallId: id,
          toolName: name,
          input: parseJson(
            stringValue(fn.arguments, `${param}.function_call.arguments`),
            `${param}.function_call.arguments`,
          ),
        });
      }
      return { role: "assistant", content };
    }
    if (message.role === "function") {
      if (!lastLegacyFunctionCallId || !message.name) {
        throw invalidRequest(
          "A legacy function result must follow an assistant function_call and include a name.",
          param,
        );
      }
      return {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: lastLegacyFunctionCallId,
            toolName: message.name,
            output: toolResultOutput(message.content ?? ""),
          },
        ],
      };
    }

    const toolCallId = stringValue(
      message.tool_call_id,
      `${param}.tool_call_id`,
    );
    const toolName = toolNames.get(toolCallId);
    if (!toolName) {
      throw invalidRequest(
        `No matching assistant tool call was found for '${toolCallId}'.`,
        `${param}.tool_call_id`,
      );
    }
    return {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId,
          toolName,
          output: toolResultOutput(
            textContent(message.content, `${param}.content`),
          ),
        },
      ],
    };
  });
}
