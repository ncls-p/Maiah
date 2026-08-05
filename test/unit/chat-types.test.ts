import { aggregateChatUsageImpact,appendMessagePart,canContinueAssistantMessage,prepareAssistantMessageContinuation,preserveAssistantFailureParts,type ChatMessage } from "@/components/chat/chat-types";
import { describe,expect,it } from "vitest";

describe("chat message parts", () => {
  it("aggregates usage impact across assistant messages", () => {
    const messages: ChatMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "impact",
            content: JSON.stringify({
              inputTokens: 100,
              outputTokens: 50,
              cost: 0.0086,
              currency: "EUR",
              energyKwh: 0.0125,
              co2Grams: 0.8,
            }),
          },
        ],
      },
      {
        id: "assistant-2",
        role: "assistant",
        parts: [
          {
            type: "impact",
            content: JSON.stringify({
              inputTokens: 200,
              outputTokens: 75,
              cost: 0.0014,
              currency: "EUR",
              energyKwh: 0.0025,
              co2Grams: 0.2,
            }),
          },
        ],
      },
    ];

    const impact = aggregateChatUsageImpact(messages);
    expect(impact).toMatchObject({
      inputTokens: 300,
      outputTokens: 125,
      cost: 0.01,
      currency: "EUR",
      co2Grams: 1,
    });
    expect(impact?.energyKwh).toBeCloseTo(0.015);
  });

  it("ignores malformed impacts and does not combine different currencies", () => {
    const messages: ChatMessage[] = [
      {
        id: "assistant",
        role: "assistant",
        parts: [
          { type: "impact", content: "invalid" },
          {
            type: "impact",
            content: JSON.stringify({ cost: 1, currency: "EUR" }),
          },
          {
            type: "impact",
            content: JSON.stringify({ cost: 1, currency: "USD" }),
          },
        ],
      },
    ];

    expect(aggregateChatUsageImpact(messages)?.cost).toBeNull();
    expect(aggregateChatUsageImpact([])).toBeNull();
  });

  it("only continues the latest completed assistant response with text", () => {
    const completedAssistant: ChatMessage = {
      id: "assistant-latest",
      role: "assistant",
      status: "completed",
      parts: [{ type: "text", content: "Partial response" }],
    };

    expect(canContinueAssistantMessage(completedAssistant, "assistant-latest")).toBe(true);
    expect(canContinueAssistantMessage({ ...completedAssistant, status: "streaming" }, "assistant-latest")).toBe(false);
    expect(canContinueAssistantMessage(completedAssistant, "assistant-older")).toBe(false);
    expect(canContinueAssistantMessage({ ...completedAssistant, parts: [{ type: "text", content: "  " }] }, "assistant-latest")).toBe(false);
    expect(canContinueAssistantMessage({ ...completedAssistant, role: "user" }, "assistant-latest")).toBe(false);
  });

  it("continues the existing assistant message without creating a new row", () => {
    const message = {
      id: "assistant-latest",
      role: "assistant" as const,
      status: "completed",
      parts: [
        { type: "text", content: "Existing answer" },
        { type: "suggestions", content: '["Follow up"]' },
        {
          type: "impact",
          content: '{"cost":0.1,"currency":"EUR"}',
        },
      ],
    };

    expect(prepareAssistantMessageContinuation(message)).toEqual({
      id: message.id,
      role: "assistant",
      status: "streaming",
      parts: [{ type: "text", content: "Existing answer" }],
    });
  });

  it("preserves the execution trace when an assistant request fails", () => {
    const parts: ChatMessage["parts"] = [
      {
        type: "tool-call",
        content: JSON.stringify({ toolName: "delegate_specialist_1" }),
      },
    ];

    expect(preserveAssistantFailureParts(parts)).toBe(parts);
    expect(preserveAssistantFailureParts([])).toEqual([{ type: "text", content: "The assistant failed to respond." }]);
  });

  it("keeps reasoning blocks split across tool calls", () => {
    let parts: ChatMessage["parts"] = [];

    parts = appendMessagePart(parts, "reasoning", "before tool");
    parts = [
      ...parts,
      {
        type: "tool-call",
        content: JSON.stringify({ toolName: "web_search" }),
      },
    ];
    parts = appendMessagePart(parts, "reasoning", "after tool");

    expect(parts).toEqual([
      { type: "reasoning", content: "before tool", state: "streaming" },
      {
        type: "tool-call",
        content: JSON.stringify({ toolName: "web_search" }),
      },
      { type: "reasoning", content: "after tool", state: "streaming" },
    ]);
  });

  it("still merges consecutive deltas of the same type", () => {
    let parts: ChatMessage["parts"] = [];

    parts = appendMessagePart(parts, "reasoning", "first ");
    parts = appendMessagePart(parts, "reasoning", "second");

    expect(parts).toEqual([{ type: "reasoning", content: "first second", state: "streaming" }]);
  });
});
