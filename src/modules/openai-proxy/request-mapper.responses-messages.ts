import type { JSONSchema7 } from "@ai-sdk/provider";
import {
dynamicTool,
jsonSchema,
Output,
type ModelMessage,
type ToolChoice,
type ToolSet,
} from "ai";

import type {
FunctionDefinition,
ProxyResponseFormat,
ProxyToolChoice,
ResponsesRequest
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

export function responsesMessages(request: ResponsesRequest): ModelMessage[] {
  if (typeof request.input === "string") {
    return [{ role: "user", content: request.input }];
  }

  const toolNames = new Map<string, string>();
  return request.input.map((rawItem, index): ModelMessage => {
    const item = rawItem as Record<string, unknown>;
    const param = `input.${index}`;
    if (
      item.role === "system" ||
      item.role === "developer" ||
      item.role === "user" ||
      item.role === "assistant"
    ) {
      if (item.role === "system" || item.role === "developer") {
        return {
          role: "system",
          content: textContent(item.content, `${param}.content`),
        };
      }
      if (item.role === "user") {
        return {
          role: "user",
          content: userContent(item.content, `${param}.content`),
        };
      }
      return {
        role: "assistant",
        content: textContent(item.content, `${param}.content`),
      };
    }
    if (item.type === "function_call") {
      const callId = stringValue(item.call_id, `${param}.call_id`);
      const name = stringValue(item.name, `${param}.name`);
      toolNames.set(callId, name);
      return {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: callId,
            toolName: name,
            input: parseJson(
              stringValue(item.arguments, `${param}.arguments`),
              `${param}.arguments`,
            ),
          },
        ],
      };
    }
    if (item.type === "function_call_output") {
      const callId = stringValue(item.call_id, `${param}.call_id`);
      const toolName = toolNames.get(callId);
      if (!toolName) {
        throw invalidRequest(
          `No matching function_call was found for '${callId}'.`,
          `${param}.call_id`,
        );
      }
      return {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: callId,
            toolName,
            output: toolResultOutput(item.output),
          },
        ],
      };
    }
    throw invalidRequest(
      `Unsupported Responses input item '${String(item.type ?? item.role)}'.`,
      `${param}.type`,
      "unsupported_input_item",
    );
  });
}

export function normalizeToolChoice(
  choice: ProxyToolChoice | undefined,
): ToolChoice<ToolSet> | undefined {
  if (!choice || typeof choice === "string") return choice;
  const name =
    "function" in choice && choice.function != null
      ? stringValue(
          objectValue(choice.function, "tool_choice.function").name,
          "tool_choice.function.name",
        )
      : stringValue(choice.name, "tool_choice.name");
  return { type: "tool", toolName: name };
}

export function buildTools(definitions: FunctionDefinition[] | undefined) {
  if (!definitions?.length) return undefined;
  const tools: ToolSet = Object.create(null) as ToolSet;
  for (const definition of definitions) {
    if (definition.defer_loading) {
      throw invalidRequest(
        "Deferred tool loading is not supported by this proxy.",
        "tools",
        "unsupported_parameter",
      );
    }
    if (!/^[A-Za-z0-9_-]+$/.test(definition.name)) {
      throw invalidRequest(
        `Invalid tool name '${definition.name}'.`,
        "tools",
        "invalid_tool_name",
      );
    }
    if (definition.name in tools) {
      throw invalidRequest(
        `Duplicate tool name '${definition.name}'.`,
        "tools",
        "duplicate_tool",
      );
    }
    tools[definition.name] = dynamicTool({
      description: definition.description,
      inputSchema: jsonSchema(
        (definition.parameters ?? {
          type: "object",
          properties: {},
        }) as JSONSchema7,
      ),
      outputSchema: jsonSchema({} as JSONSchema7),
      strict: definition.strict,
    });
  }
  return tools;
}

export function prepareOutput(format: ProxyResponseFormat | undefined) {
  if (!format || format.type === "text") {
    return {
      output: Output.text(),
      responseFormat: { type: "text" } as const,
    };
  }
  if (format.type === "json_object") {
    return {
      output: Output.json(),
      responseFormat: { type: "json_object" } as const,
    };
  }
  return {
    output: Output.object({
      name: format.name,
      description: format.description,
      schema: jsonSchema(format.schema as JSONSchema7),
    }),
    responseFormat: format,
  };
}
