import { generateText, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { withOpenAISchemaCompatibility } from "@/server/infrastructure/providers/openai-schema-compatibility";

it("retains tool validation when the provider copy accepts implicit string key schemas", async () => {
  const execute = vi.fn();
  const model = withOpenAISchemaCompatibility(
    new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "catalog",
            input: JSON.stringify({ options: { forbidden: "value" } }),
          },
        ],
        finishReason: { unified: "tool-calls", raw: "tool_calls" },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        warnings: [],
      }),
    }),
  );
  const result = await generateText({
    model,
    prompt: "configure catalog",
    tools: {
      catalog: tool({
        inputSchema: z.object({
          options: z.record(z.string().regex(/^(color|storage)$/), z.string()),
        }),
        execute,
      }),
    },
  });
  expect(execute).not.toHaveBeenCalled();
  expect(result.content).toContainEqual(
    expect.objectContaining({ type: "tool-error", toolName: "catalog" }),
  );
});
