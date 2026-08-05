import type { LanguageModelUsage,TextStreamPart,ToolSet } from "ai";
import { describe,expect,it,vi } from "vitest";

import {
chatCompletionRequestSchema,
responsesRequestSchema,
} from "@/modules/openai-proxy/contracts";
import {
createChatCompletionStream,
createResponsesStream,
} from "@/modules/openai-proxy/streams";

const usage: LanguageModelUsage = {
  inputTokens: 6,
  inputTokenDetails: {
    noCacheTokens: 4,
    cacheReadTokens: 2,
    cacheWriteTokens: 0,
  },
  outputTokens: 3,
  outputTokenDetails: { textTokens: 2, reasoningTokens: 1 },
  totalTokens: 9,
};

function chat(body: Record<string, unknown>) {
  return chatCompletionRequestSchema.parse({
    model: "model-a",
    messages: [{ role: "user", content: "Hello" }],
    ...body,
  });
}

function responses(body: Record<string, unknown>) {
  return responsesRequestSchema.parse({
    model: "model-a",
    input: "Hello",
    ...body,
  });
}

async function* parts(
  values: Array<TextStreamPart<ToolSet>>,
): AsyncIterable<TextStreamPart<ToolSet>> {
  for (const value of values) yield value;
}

async function responseText(response: Response) {
  return await response.text();
}

describe("OpenAI proxy streaming edge cases", () => {
  it("streams Chat function calls and reports upstream failures", async () => {
    const complete = createChatCompletionStream({
      request: chat({ stream: true, stream_options: { include_usage: true } }),
      result: {
        stream: parts([
          { type: "start" },
          {
            type: "tool-input-start",
            id: "call_1",
            toolName: "lookup",
            providerExecuted: false,
          },
          { type: "tool-input-delta", id: "call_1", delta: '{"id":1}' },
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "lookup",
            input: { id: 1 },
            providerExecuted: false,
            dynamic: true,
          },
          {
            type: "finish",
            finishReason: "tool-calls",
            rawFinishReason: "tool_calls",
            totalUsage: usage,
          },
        ]),
      },
      callbacks: { onComplete: vi.fn(), onError: vi.fn() },
    });
    const body = await responseText(complete);
    expect(body).toContain('"finish_reason":"tool_calls"');
    expect(body).toContain("data: [DONE]");

    const failed = createChatCompletionStream({
      request: chat({ stream: true }),
      result: { stream: parts([{ type: "error", error: new Error("boom") }]) },
      callbacks: { onComplete: vi.fn(), onError: vi.fn() },
    });
    expect(await responseText(failed)).toContain('"code":"upstream_error"');
  });

  it("streams Responses function calls and failure events", async () => {
    const complete = createResponsesStream({
      request: responses({ stream: true }),
      responseFormat: { type: "text" },
      result: {
        stream: parts([
          { type: "start" },
          {
            type: "tool-call",
            toolCallId: "call_2",
            toolName: "lookup",
            input: { id: 2 },
            providerExecuted: false,
            dynamic: true,
          },
          {
            type: "finish",
            finishReason: "tool-calls",
            rawFinishReason: "tool_calls",
            totalUsage: usage,
          },
        ]),
      },
      callbacks: { onComplete: vi.fn(), onError: vi.fn() },
    });
    const body = await responseText(complete);
    expect(body).toContain("response.function_call_arguments.done");
    expect(body).toContain("response.completed");

    const failed = createResponsesStream({
      request: responses({ stream: true }),
      responseFormat: { type: "text" },
      result: { stream: parts([{ type: "abort", reason: "cancelled" }]) },
      callbacks: { onComplete: vi.fn(), onError: vi.fn() },
    });
    expect(await responseText(failed)).toContain("response.failed");
  });
});
