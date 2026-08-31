import {
  buildChatCompletionResponse,
  buildResponsesResponse,
  chatFinishReason,
  chatUsage,
  createChatCompletionId,
  createFunctionItemId,
  createMessageId,
  createResponseId,
  responseCompletionState,
  responseTextConfig,
  responsesUsage,
} from "@/modules/openai-proxy/response-builders";
import type { ProxyGenerationResult } from "@/modules/openai-proxy/response-builders";
import { describe, expect, it } from "vitest";

const bareUsage = {
  inputTokenDetails: {
    noCacheTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  },
  outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
} as never;

function result(overrides: Partial<ProxyGenerationResult> = {}): ProxyGenerationResult {
  return {
    text: "hello",
    toolCalls: [],
    finishReason: "stop",
    usage: {
      inputTokens: 3,
      outputTokens: 4,
      totalTokens: 7,
      inputTokenDetails: {
        noCacheTokens: 2,
        cacheReadTokens: 1,
        cacheWriteTokens: 0,
      },
      outputTokenDetails: { textTokens: 2, reasoningTokens: 2 },
    },
    ...overrides,
  };
}

describe("openai proxy response builders branch coverage", () => {
  it("creates stable id shapes", () => {
    expect(createChatCompletionId()).toMatch(/^chatcmpl-[0-9a-f]{32}$/);
    expect(createResponseId()).toMatch(/^resp_[0-9a-f]{32}$/);
    expect(createMessageId()).toMatch(/^msg_[0-9a-f]{32}$/);
    expect(createFunctionItemId()).toMatch(/^fc_[0-9a-f]{32}$/);
  });

  it("maps every finish reason", () => {
    expect(chatFinishReason("length")).toBe("length");
    expect(chatFinishReason("content-filter")).toBe("content_filter");
    expect(chatFinishReason("tool-calls")).toBe("tool_calls");
    expect(chatFinishReason("stop")).toBe("stop");
    expect(chatFinishReason("error" as never)).toBe("stop");
  });

  it("defaults missing usage fields", () => {
    expect(chatUsage(bareUsage)).toEqual({
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      prompt_tokens_details: { cached_tokens: 0 },
      completion_tokens_details: { reasoning_tokens: 0 },
    });
    expect(responsesUsage(bareUsage)).toEqual({
      input_tokens: 0,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 0,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 0,
    });
    const partial = {
      inputTokens: 5,
      outputTokens: 6,
      inputTokenDetails: {
        noCacheTokens: 5,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      outputTokenDetails: { textTokens: 6, reasoningTokens: 0 },
    } as never;
    expect(chatUsage(partial).total_tokens).toBe(11);
    expect(responsesUsage(partial).total_tokens).toBe(11);
  });

  it("builds chat completion responses with and without tool calls", () => {
    const withTools = buildChatCompletionResponse({
      request: { model: "gpt-x" } as never,
      result: result({
        text: "",
        toolCalls: [
          { toolCallId: "call-1", toolName: "search", input: undefined },
        ],
        finishReason: "tool-calls",
      }),
      id: "chatcmpl-fixed",
      created: 123,
    });
    expect(withTools.id).toBe("chatcmpl-fixed");
    expect(withTools.created).toBe(123);
    expect(withTools.choices[0].message.content).toBeNull();
    expect(withTools.choices[0].message.tool_calls).toEqual([
      {
        id: "call-1",
        type: "function",
        function: { name: "search", arguments: "{}" },
      },
    ]);
    expect(withTools.choices[0].finish_reason).toBe("tool_calls");
    expect(withTools.service_tier).toBe("default");

    const textOnly = buildChatCompletionResponse({
      request: { model: "gpt-x", service_tier: "flex" } as never,
      result: result(),
    });
    expect(textOnly.choices[0].message.content).toBe("hello");
    expect(textOnly.choices[0].message.tool_calls).toBeUndefined();
    expect(textOnly.service_tier).toBe("flex");
    expect(textOnly.id).toMatch(/^chatcmpl-/);
  });

  it("builds responses api responses with status and format variants", () => {
    const completed = buildResponsesResponse({
      request: { model: "gpt-x" } as never,
      responseFormat: { type: "text" } as never,
      result: result({
        text: "",
        toolCalls: [
          { toolCallId: "call-9", toolName: "lookup", input: { q: 1 } },
        ],
      }),
      id: "resp-fixed",
      createdAt: 456,
    });
    expect(completed.id).toBe("resp-fixed");
    expect(completed.created_at).toBe(456);
    expect(completed.status).toBe("completed");
    expect(completed.incomplete_details).toBeNull();
    expect(completed.output).toHaveLength(1);
    expect(completed.output[0]).toMatchObject({
      type: "function_call",
      name: "lookup",
      arguments: '{"q":1}',
      call_id: "call-9",
    });
    expect(completed.text).toEqual({ format: { type: "text" } });
    expect(completed.temperature).toBe(1);
    expect(completed.tool_choice).toBe("auto");
    expect(completed.tools).toEqual([]);
    expect(completed.store).toBe(false);
    expect(completed.metadata).toEqual({});

    const truncated = buildResponsesResponse({
      request: {
        model: "gpt-x",
        instructions: "be brief",
        max_output_tokens: 10,
        parallel_tool_calls: false,
        reasoning: { effort: "low" },
        safety_identifier: "user-1",
        service_tier: "flex",
        store: true,
        temperature: 0.2,
        tool_choice: "none",
        tools: [{ type: "function" }],
        top_p: 0.9,
        truncation: "auto",
        metadata: { team: "a" },
      } as never,
      responseFormat: {
        type: "json_schema",
        name: "answer",
        description: "d",
        schema: { type: "object" },
      } as never,
      result: result({ finishReason: "length" }),
    });
    expect(truncated.status).toBe("incomplete");
    expect(truncated.incomplete_details).toEqual({
      reason: "max_output_tokens",
    });
    expect(truncated.text).toEqual({
      format: {
        type: "json_schema",
        name: "answer",
        description: "d",
        schema: { type: "object" },
        strict: false,
      },
    });
    expect(truncated.instructions).toBe("be brief");
    expect(truncated.max_output_tokens).toBe(10);
    expect(truncated.parallel_tool_calls).toBe(false);
    expect(truncated.reasoning).toEqual({ effort: "low" });
    expect(truncated.safety_identifier).toBe("user-1");
    expect(truncated.service_tier).toBe("flex");
    expect(truncated.store).toBe(true);
    expect(truncated.temperature).toBe(0.2);
    expect(truncated.tool_choice).toBe("none");
    expect(truncated.tools).toEqual([{ type: "function" }]);
    expect(truncated.top_p).toBe(0.9);
    expect(truncated.truncation).toBe("auto");
    expect(truncated.metadata).toEqual({ team: "a" });
  });

  it("reports completion state for every finish reason", () => {
    expect(responseCompletionState("stop")).toEqual({
      status: "completed",
      incompleteDetails: null,
    });
    expect(responseCompletionState("length")).toEqual({
      status: "incomplete",
      incompleteDetails: { reason: "max_output_tokens" },
    });
    expect(responseCompletionState("content-filter")).toEqual({
      status: "incomplete",
      incompleteDetails: { reason: "content_filter" },
    });
  });
});