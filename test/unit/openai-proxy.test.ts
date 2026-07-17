import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import type { LanguageModelUsage, TextStreamPart, ToolSet } from "ai";

import {
  chatCompletionRequestSchema,
  responsesRequestSchema,
} from "@/modules/openai-proxy/contracts";
import { OpenAIProxyError } from "@/modules/openai-proxy/errors";
import {
  prepareChatCompletion,
  prepareResponsesRequest,
} from "@/modules/openai-proxy/request-mapper";
import {
  buildChatCompletionResponse,
  buildResponsesResponse,
} from "@/modules/openai-proxy/response-builders";
import {
  createChatCompletionStream,
  createResponsesStream,
} from "@/modules/openai-proxy/streams";

const usage: LanguageModelUsage = {
  inputTokens: 7,
  inputTokenDetails: {
    noCacheTokens: 5,
    cacheReadTokens: 2,
    cacheWriteTokens: 0,
  },
  outputTokens: 3,
  outputTokenDetails: { textTokens: 3, reasoningTokens: 0 },
  totalTokens: 10,
};

async function* textParts(): AsyncIterable<TextStreamPart<ToolSet>> {
  yield { type: "start" };
  yield { type: "text-start", id: "text-1" };
  yield { type: "text-delta", id: "text-1", text: "Bonjour" };
  yield { type: "text-delta", id: "text-1", text: " Maiah" };
  yield { type: "text-end", id: "text-1" };
  yield {
    type: "finish",
    finishReason: "stop",
    rawFinishReason: "stop",
    totalUsage: usage,
  };
}

function clientWith(fetch: typeof globalThis.fetch) {
  return new OpenAI({
    apiKey: "ahub_test",
    baseURL: "http://maiah.test/api/v1",
    fetch,
    maxRetries: 0,
  });
}

describe("OpenAI-compatible request mapping", () => {
  it("maps multimodal chat, tools, tool results and JSON Schema output", () => {
    const parsed = chatCompletionRequestSchema.parse({
      model: "provider/model",
      messages: [
        { role: "developer", content: "Answer concisely" },
        {
          role: "user",
          content: [
            { type: "text", text: "Describe" },
            {
              type: "image_url",
              image_url: { url: "https://example.test/image.png" },
            },
          ],
        },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "lookup", arguments: '{"id":42}' },
            },
          ],
        },
        { role: "tool", tool_call_id: "call_1", content: "found" },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "lookup",
            parameters: {
              type: "object",
              properties: { id: { type: "number" } },
              required: ["id"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "lookup" } },
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "answer",
          strict: true,
          schema: {
            type: "object",
            properties: { answer: { type: "string" } },
            required: ["answer"],
            additionalProperties: false,
          },
        },
      },
    });

    const prepared = prepareChatCompletion(parsed);
    expect(prepared.messages).toHaveLength(4);
    expect(prepared.tools).toHaveProperty("lookup");
    expect(prepared.toolChoice).toEqual({ type: "tool", toolName: "lookup" });
    expect(prepared.responseFormat).toMatchObject({
      type: "json_schema",
      name: "answer",
      strict: true,
    });
  });

  it("maps Responses function-call round trips", () => {
    const request = responsesRequestSchema.parse({
      model: "model-a",
      instructions: "Use the order system",
      input: [
        { role: "user", content: "Find order 42" },
        {
          type: "function_call",
          call_id: "call_42",
          name: "find_order",
          arguments: '{"id":42}',
        },
        {
          type: "function_call_output",
          call_id: "call_42",
          output: '{"status":"paid"}',
        },
      ],
      tools: [
        {
          type: "function",
          name: "find_order",
          parameters: { type: "object" },
        },
      ],
    });
    const prepared = prepareResponsesRequest(request);
    expect(prepared.messages.map((message) => message.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
    ]);
    expect(prepared.tools).toHaveProperty("find_order");
  });

  it("rejects unsupported behavior explicitly instead of silently ignoring it", () => {
    const chat = chatCompletionRequestSchema.parse({
      model: "model-a",
      messages: [{ role: "user", content: "Hello" }],
      n: 2,
    });
    expect(() => prepareChatCompletion(chat)).toThrowError(OpenAIProxyError);

    const responses = responsesRequestSchema.parse({
      model: "model-a",
      input: "Hello",
      previous_response_id: "resp_previous",
    });
    expect(() => prepareResponsesRequest(responses)).toThrow(/stateless/i);
  });
});

describe("official OpenAI SDK compatibility", () => {
  it("parses non-streaming Chat Completions and Responses objects", async () => {
    const chatFetch = vi.fn(async () =>
      Response.json(
        buildChatCompletionResponse({
          request: chatCompletionRequestSchema.parse({
            model: "model-a",
            messages: [{ role: "user", content: "Hello" }],
          }),
          result: {
            text: "Bonjour Maiah",
            toolCalls: [],
            finishReason: "stop",
            usage,
          },
        }),
      ),
    ) as typeof globalThis.fetch;
    const chat = await clientWith(chatFetch).chat.completions.create({
      model: "model-a",
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(chat.choices[0]?.message.content).toBe("Bonjour Maiah");
    expect(chat.usage?.total_tokens).toBe(10);

    const responseFetch = vi.fn(async () =>
      Response.json(
        buildResponsesResponse({
          request: responsesRequestSchema.parse({
            model: "model-a",
            input: "Hello",
          }),
          responseFormat: { type: "text" },
          result: {
            text: "Bonjour Maiah",
            toolCalls: [],
            finishReason: "stop",
            usage,
          },
        }),
      ),
    ) as typeof globalThis.fetch;
    const response = await clientWith(responseFetch).responses.create({
      model: "model-a",
      input: "Hello",
    });
    expect(response.output_text).toBe("Bonjour Maiah");
    expect(response.usage?.total_tokens).toBe(10);
  });

  it("parses Chat Completions SSE including the final usage chunk", async () => {
    const onComplete = vi.fn();
    const fetch = vi.fn(async () =>
      createChatCompletionStream({
        request: chatCompletionRequestSchema.parse({
          model: "model-a",
          messages: [{ role: "user", content: "Hello" }],
          stream: true,
          stream_options: { include_usage: true },
        }),
        result: { stream: textParts() },
        callbacks: { onComplete, onError: vi.fn() },
      }),
    ) as typeof globalThis.fetch;

    const stream = await clientWith(fetch).chat.completions.create({
      model: "model-a",
      messages: [{ role: "user", content: "Hello" }],
      stream: true,
      stream_options: { include_usage: true },
    });
    let text = "";
    let totalTokens: number | undefined;
    for await (const event of stream) {
      text += event.choices[0]?.delta.content ?? "";
      totalTokens = event.usage?.total_tokens ?? totalTokens;
    }
    expect(text).toBe("Bonjour Maiah");
    expect(totalTokens).toBe(10);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("parses Responses named SSE through response.completed", async () => {
    const onComplete = vi.fn();
    const fetch = vi.fn(async () =>
      createResponsesStream({
        request: responsesRequestSchema.parse({
          model: "model-a",
          input: "Hello",
          stream: true,
        }),
        responseFormat: { type: "text" },
        result: { stream: textParts() },
        callbacks: { onComplete, onError: vi.fn() },
      }),
    ) as typeof globalThis.fetch;

    const stream = await clientWith(fetch).responses.create({
      model: "model-a",
      input: "Hello",
      stream: true,
    });
    const types: string[] = [];
    let text = "";
    for await (const event of stream) {
      types.push(event.type);
      if (event.type === "response.output_text.delta") text += event.delta;
    }
    expect(text).toBe("Bonjour Maiah");
    expect(types).toContain("response.created");
    expect(types).toContain("response.output_text.done");
    expect(types.at(-1)).toBe("response.completed");
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
