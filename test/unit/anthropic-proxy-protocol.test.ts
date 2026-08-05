import type { LanguageModelUsage, TextStreamPart, ToolSet } from "ai";
import { describe, expect, it, vi } from "vitest";

import { anthropicMessagesRequestSchema } from "@/modules/anthropic-proxy/contracts";
import { anthropicErrorBody } from "@/modules/anthropic-proxy/errors";
import { prepareAnthropicMessages } from "@/modules/anthropic-proxy/request-mapper";
import {
  anthropicStopReason,
  anthropicUsage,
  buildAnthropicMessageResponse,
} from "@/modules/anthropic-proxy/response-builders";
import { createAnthropicMessagesStream } from "@/modules/anthropic-proxy/streams";
import { OpenAIProxyError } from "@/modules/openai-proxy/errors";

const usage: LanguageModelUsage = {
  inputTokens: 8,
  inputTokenDetails: {
    noCacheTokens: 6,
    cacheReadTokens: 2,
    cacheWriteTokens: 0,
  },
  outputTokens: 4,
  outputTokenDetails: { textTokens: 4, reasoningTokens: 0 },
  totalTokens: 12,
};

function request(overrides: Record<string, unknown> = {}) {
  return anthropicMessagesRequestSchema.parse({
    model: "model-a",
    max_tokens: 256,
    messages: [{ role: "user", content: "Hello" }],
    ...overrides,
  });
}

async function* parts(values: Array<TextStreamPart<ToolSet>>) {
  for (const value of values) yield value;
}

describe("Anthropic-compatible protocol", () => {
  it("maps system prompts, images, tools, and tool results", () => {
    const prepared = prepareAnthropicMessages(
      request({
        system: [{ type: "text", text: "Be concise" }],
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Inspect" },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: "aGVsbG8=",
                },
              },
            ],
          },
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "toolu_1",
                name: "lookup",
                input: { id: 42 },
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "toolu_1",
                content: "found",
              },
            ],
          },
        ],
        tools: [
          {
            name: "lookup",
            input_schema: { type: "object", properties: {} },
          },
        ],
        tool_choice: { type: "tool", name: "lookup" },
        top_k: 20,
      }),
    );
    expect(prepared.messages.map((message) => message.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
    ]);
    expect(prepared.toolChoice).toEqual({ type: "tool", toolName: "lookup" });
    expect(prepared.topK).toBe(20);
  });

  it("builds Anthropic message and usage fields", () => {
    const response = buildAnthropicMessageResponse({
      request: request(),
      result: {
        text: "Hello",
        toolCalls: [
          { toolCallId: "toolu_1", toolName: "lookup", input: { id: 42 } },
        ],
        finishReason: "tool-calls",
        usage,
      },
      id: "msg_test",
    });
    expect(response).toMatchObject({
      id: "msg_test",
      type: "message",
      role: "assistant",
      stop_reason: "tool_use",
      usage: { input_tokens: 8, output_tokens: 4 },
    });
    expect(response.content).toHaveLength(2);
    expect(anthropicStopReason("length")).toBe("max_tokens");
    expect(anthropicUsage(usage).cache_read_input_tokens).toBe(2);
  });

  it("emits the official SSE event sequence", async () => {
    const onComplete = vi.fn();
    const response = createAnthropicMessagesStream({
      request: request({ stream: true }),
      requestId: "req_test",
      result: {
        stream: parts([
          { type: "text-start", id: "text_1", providerMetadata: undefined },
          {
            type: "text-delta",
            id: "text_1",
            text: "Hello",
            providerMetadata: undefined,
          },
          { type: "text-end", id: "text_1", providerMetadata: undefined },
          {
            type: "finish",
            finishReason: "stop",
            rawFinishReason: "stop",
            totalUsage: usage,
          },
        ]),
      },
      callbacks: { onComplete, onError: vi.fn() },
    });
    const body = await response.text();
    expect(body).toContain("event: message_start");
    expect(body).toContain("event: content_block_start");
    expect(body).toContain('"type":"text_delta","text":"Hello"');
    expect(body).toContain("event: message_delta");
    expect(body).toContain("event: message_stop");
    expect(onComplete).toHaveBeenCalledWith(usage);
  });

  it("uses Anthropic error envelopes", () => {
    const body = anthropicErrorBody(
      new OpenAIProxyError("Bad key", 401, "authentication_error"),
      "req_test",
    );
    expect(body).toEqual({
      type: "error",
      error: { type: "authentication_error", message: "Bad key" },
      request_id: "req_test",
    });
  });
});
