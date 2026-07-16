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

type PreparedOutput =
  | ReturnType<typeof Output.text>
  | ReturnType<typeof Output.json>
  | ReturnType<typeof Output.object>;

export type PreparedProxyGeneration = {
  messages: ModelMessage[];
  tools: ToolSet | undefined;
  toolChoice: ToolChoice<ToolSet> | undefined;
  output: PreparedOutput;
  responseFormat: ProxyResponseFormat;
  maxOutputTokens: number | undefined;
  temperature: number | undefined;
  topP: number | undefined;
  presencePenalty: number | undefined;
  frequencyPenalty: number | undefined;
  seed: number | undefined;
  stopSequences: string[] | undefined;
  providerOptions: Record<string, JSONValue | undefined>;
};

function objectValue(value: unknown, param: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidRequest(`Expected an object for '${param}'.`, param);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, param: string) {
  if (typeof value !== "string") {
    throw invalidRequest(`Expected a string for '${param}'.`, param);
  }
  return value;
}

function parseJson(value: string, param: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw invalidRequest(`Invalid JSON in '${param}'.`, param, "invalid_json");
  }
}

function urlValue(value: unknown, param: string) {
  const raw = stringValue(value, param);
  try {
    return new URL(raw);
  } catch {
    throw invalidRequest(`Invalid URL in '${param}'.`, param);
  }
}

function textContent(value: unknown, param: string) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) {
    throw invalidRequest(`Expected text content for '${param}'.`, param);
  }
  return value
    .map((part, index) => {
      const item = objectValue(part, `${param}.${index}`);
      if (
        item.type !== "text" &&
        item.type !== "input_text" &&
        item.type !== "output_text"
      ) {
        throw invalidRequest(
          `Unsupported content type '${String(item.type)}' in '${param}'.`,
          `${param}.${index}.type`,
          "unsupported_content_type",
        );
      }
      return stringValue(item.text, `${param}.${index}.text`);
    })
    .join("");
}

function userContent(value: unknown, param: string) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) {
    throw invalidRequest(`Expected user content for '${param}'.`, param);
  }

  return value.map((part, index) => {
    const item = objectValue(part, `${param}.${index}`);
    if (item.type === "text" || item.type === "input_text") {
      return {
        type: "text" as const,
        text: stringValue(item.text, `${param}.${index}.text`),
      };
    }
    if (item.type === "image_url") {
      const image =
        typeof item.image_url === "string"
          ? item.image_url
          : objectValue(item.image_url, `${param}.${index}.image_url`).url;
      return {
        type: "file" as const,
        mediaType: "image",
        data: urlValue(image, `${param}.${index}.image_url.url`),
      };
    }
    if (item.type === "input_image") {
      return {
        type: "file" as const,
        mediaType: "image",
        data: urlValue(item.image_url, `${param}.${index}.image_url`),
      };
    }
    if (item.type === "input_file" && typeof item.file_url === "string") {
      return {
        type: "file" as const,
        mediaType: "application/octet-stream",
        data: urlValue(item.file_url, `${param}.${index}.file_url`),
        filename: typeof item.filename === "string" ? item.filename : undefined,
      };
    }
    if (item.type === "input_file" && typeof item.file_data === "string") {
      return {
        type: "file" as const,
        mediaType: "application/octet-stream",
        data: item.file_data,
        filename: typeof item.filename === "string" ? item.filename : undefined,
      };
    }
    throw invalidRequest(
      `Unsupported content type '${String(item.type)}' in '${param}'.`,
      `${param}.${index}.type`,
      "unsupported_content_type",
    );
  });
}

function toolResultOutput(value: unknown) {
  if (typeof value === "string") return { type: "text" as const, value };
  return { type: "json" as const, value: value as JSONValue };
}

function chatMessages(request: ChatCompletionRequest): ModelMessage[] {
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

function responsesMessages(request: ResponsesRequest): ModelMessage[] {
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

function normalizeToolChoice(
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

function buildTools(definitions: FunctionDefinition[] | undefined) {
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

function prepareOutput(format: ProxyResponseFormat | undefined) {
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

function commonPreparation(input: {
  messages: ModelMessage[];
  definitions?: FunctionDefinition[];
  toolChoice?: ProxyToolChoice;
  responseFormat?: ProxyResponseFormat;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  seed?: number;
  stop?: string | string[];
  providerOptions?: Record<string, JSONValue | undefined>;
}): PreparedProxyGeneration {
  const tools = buildTools(input.definitions);
  const toolChoice = normalizeToolChoice(input.toolChoice);
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
  const output = prepareOutput(input.responseFormat);
  return {
    messages: input.messages,
    tools,
    toolChoice,
    ...output,
    maxOutputTokens: input.maxOutputTokens,
    temperature: input.temperature,
    topP: input.topP,
    presencePenalty: input.presencePenalty,
    frequencyPenalty: input.frequencyPenalty,
    seed: input.seed,
    stopSequences: typeof input.stop === "string" ? [input.stop] : input.stop,
    providerOptions: input.providerOptions ?? {},
  };
}

export function prepareChatCompletion(
  request: ChatCompletionRequest,
): PreparedProxyGeneration {
  if ((request.n ?? 1) !== 1) {
    throw invalidRequest(
      "This proxy currently supports exactly one completion per request.",
      "n",
      "unsupported_value",
    );
  }
  if (request.logprobs || request.top_logprobs != null) {
    throw invalidRequest(
      "Log probabilities are not supported by this proxy.",
      "logprobs",
      "unsupported_parameter",
    );
  }
  if (
    request.audio != null ||
    request.modalities?.some((value) => value !== "text")
  ) {
    throw invalidRequest(
      "Audio output is not supported by this proxy.",
      "modalities",
      "unsupported_parameter",
    );
  }
  if (request.store) {
    throw invalidRequest(
      "Stored completions are not supported because this proxy is stateless.",
      "store",
      "unsupported_parameter",
    );
  }
  if (
    request.web_search_options != null ||
    request.prediction != null ||
    request.verbosity != null
  ) {
    throw invalidRequest(
      "Web search options, predicted output and verbosity are not supported by this proxy.",
      request.web_search_options != null
        ? "web_search_options"
        : request.prediction != null
          ? "prediction"
          : "verbosity",
      "unsupported_parameter",
    );
  }
  if (request.tools?.length && request.functions?.length) {
    throw invalidRequest(
      "Use either tools or deprecated functions, not both.",
      "functions",
      "invalid_request",
    );
  }
  const responseFormat = request.response_format
    ? request.response_format.type === "json_schema"
      ? {
          type: "json_schema" as const,
          ...request.response_format.json_schema,
        }
      : request.response_format
    : undefined;

  const legacyToolChoice = request.function_call
    ? typeof request.function_call === "string"
      ? request.function_call
      : ({ type: "function", name: request.function_call.name } as const)
    : undefined;

  return commonPreparation({
    messages: chatMessages(request),
    definitions:
      request.tools?.map((tool) => tool.function) ?? request.functions,
    toolChoice: request.tool_choice ?? legacyToolChoice,
    responseFormat,
    maxOutputTokens:
      request.max_completion_tokens ?? request.max_tokens ?? undefined,
    temperature: request.temperature,
    topP: request.top_p,
    presencePenalty: request.presence_penalty,
    frequencyPenalty: request.frequency_penalty,
    seed: request.seed,
    stop: request.stop,
    providerOptions: {
      parallelToolCalls: request.parallel_tool_calls,
      reasoningEffort: request.reasoning_effort,
      serviceTier: request.service_tier,
      store: request.store,
      user: request.user,
    },
  });
}

export function prepareResponsesRequest(
  request: ResponsesRequest,
): PreparedProxyGeneration {
  if (request.previous_response_id) {
    throw invalidRequest(
      "previous_response_id is not available because this proxy is stateless.",
      "previous_response_id",
      "unsupported_parameter",
    );
  }
  if (request.store) {
    throw invalidRequest(
      "Stored responses are not supported because this proxy is stateless.",
      "store",
      "unsupported_parameter",
    );
  }
  if (request.background) {
    throw invalidRequest(
      "Background responses are not supported by this proxy.",
      "background",
      "unsupported_parameter",
    );
  }
  if (request.include?.length) {
    throw invalidRequest(
      "The requested include expansions are not supported by this proxy.",
      "include",
      "unsupported_parameter",
    );
  }
  if (request.reasoning?.summary) {
    throw invalidRequest(
      "Reasoning summaries are not exposed by this proxy.",
      "reasoning.summary",
      "unsupported_parameter",
    );
  }
  if (
    request.prompt != null ||
    request.conversation != null ||
    request.context_management != null ||
    request.max_tool_calls != null ||
    request.top_logprobs != null
  ) {
    const param =
      request.prompt != null
        ? "prompt"
        : request.conversation != null
          ? "conversation"
          : request.context_management != null
            ? "context_management"
            : request.max_tool_calls != null
              ? "max_tool_calls"
              : "top_logprobs";
    throw invalidRequest(
      `The '${param}' parameter is not supported by this proxy.`,
      param,
      "unsupported_parameter",
    );
  }

  const textFormat = request.text?.format;
  const responseFormat: ProxyResponseFormat | undefined = textFormat
    ? textFormat.type === "json_schema"
      ? textFormat
      : { type: textFormat.type }
    : undefined;

  const messages = responsesMessages(request);
  if (request.instructions) {
    messages.unshift({ role: "system", content: request.instructions });
  }

  return commonPreparation({
    messages,
    definitions: request.tools,
    toolChoice: request.tool_choice,
    responseFormat,
    maxOutputTokens: request.max_output_tokens,
    temperature: request.temperature,
    topP: request.top_p,
    providerOptions: {
      parallelToolCalls: request.parallel_tool_calls,
      reasoningEffort: request.reasoning?.effort,
      serviceTier: request.service_tier,
      store: request.store,
      safetyIdentifier: request.safety_identifier,
      promptCacheKey: request.prompt_cache_key,
      truncation: request.truncation,
      user: request.user,
    },
  });
}
