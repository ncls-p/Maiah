import type { TextStreamPart,ToolSet } from "ai";
import { describe,expect,it,vi } from "vitest";

import { anthropicErrorBody } from "@/modules/anthropic-proxy/errors";
import { prepareAnthropicMessages } from "@/modules/anthropic-proxy/request-mapper";
import {
anthropicStopReason,
anthropicUsage,
buildAnthropicMessageResponse,
} from "@/modules/anthropic-proxy/response-builders";
import { createAnthropicMessagesStream } from "@/modules/anthropic-proxy/streams";
import { OpenAIProxyError } from "@/modules/openai-proxy/errors";
import {
anthropicErrorCases,
anthropicStreamParts as parts,
anthropicRequest as request,
anthropicUsageFixture as usage,
} from "./anthropic-proxy-fixtures";

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

  it("maps URL images, text tool results, metadata, and tool choices", () => {
    const baseMessages = [
      {
        role: "user",
        content: [
          { type: "text", text: "Inspect" },
          {
            type: "image",
            source: { type: "url", url: "https://example.test/image.png" },
          },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "toolu_2", name: "lookup", input: {} },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_2",
            content: [
              { type: "text", text: "first" },
              { type: "text", text: "second" },
            ],
          },
        ],
      },
    ];
    const anyChoice = prepareAnthropicMessages(
      request({
        system: "Be concise",
        messages: baseMessages,
        tools: [{ name: "lookup", input_schema: { type: "object" } }],
        tool_choice: { type: "any", disable_parallel_tool_use: true },
        metadata: { user_id: "user-42" },
      }),
    );
    expect(anyChoice.toolChoice).toBe("required");
    expect(anyChoice.providerOptions).toEqual({
      user: "user-42",
      parallelToolCalls: false,
    });
    expect(prepareAnthropicMessages(request()).toolChoice).toBe("auto");
    expect(
      prepareAnthropicMessages(
        request({ tool_choice: { type: "none" }, tools: [] }),
      ).toolChoice,
    ).toBe("none");
  });

  it("rejects unmatched tool results and unknown explicit tools", () => {
    expect(() =>
      prepareAnthropicMessages(
        request({
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: "missing",
                  content: "no match",
                },
              ],
            },
          ],
        }),
      ),
    ).toThrow("No matching tool_use");
    expect(() =>
      prepareAnthropicMessages(
        request({
          tools: [{ name: "known", input_schema: { type: "object" } }],
          tool_choice: { type: "tool", name: "missing" },
        }),
      ),
    ).toThrow("was not found in tools");
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

  it("streams tool input blocks and normalizes upstream errors", async () => {
    const onComplete = vi.fn();
    const toolResponse = createAnthropicMessagesStream({
      request: request({ stream: true }),
      requestId: "req_tools",
      result: {
        stream: parts([
          {
            type: "tool-input-start",
            id: "toolu_3",
            toolName: "lookup",
          } as TextStreamPart<ToolSet>,
          {
            type: "tool-input-delta",
            id: "toolu_3",
            delta: '{"id":',
          } as TextStreamPart<ToolSet>,
          {
            type: "tool-call",
            toolCallId: "toolu_3",
            toolName: "lookup",
            input: { id: 42 },
          } as TextStreamPart<ToolSet>,
          {
            type: "finish",
            finishReason: "tool-calls",
            rawFinishReason: "tool_calls",
            totalUsage: usage,
          },
        ]),
      },
      callbacks: { onComplete, onError: vi.fn() },
    });
    const toolBody = await toolResponse.text();
    expect(toolBody).toContain('"type":"tool_use"');
    expect(toolBody).toContain('"type":"input_json_delta"');
    expect(toolBody).toContain('"stop_reason":"tool_use"');
    expect(onComplete).toHaveBeenCalledWith(usage);

    const onError = vi.fn();
    const errorResponse = createAnthropicMessagesStream({
      request: request({ stream: true }),
      requestId: "req_error",
      result: {
        stream: parts([{ type: "error", error: new Error("upstream failed") }]),
      },
      callbacks: { onComplete: vi.fn(), onError },
    });
    const errorBody = await errorResponse.text();
    expect(errorBody).toContain("event: error");
    expect(errorBody).toContain('"type":"api_error"');
    expect(onError).toHaveBeenCalledOnce();
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
    for (const [status, type] of anthropicErrorCases) {
      expect(
        anthropicErrorBody(
          new OpenAIProxyError("error", status, "invalid_request_error"),
          "req_test",
        ).error.type,
      ).toBe(type);
    }
  });
});
