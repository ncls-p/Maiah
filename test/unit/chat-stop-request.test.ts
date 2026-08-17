import { describe, expect, it } from "vitest";

import { chatStopRequestSchema } from "@/modules/chat/chat-stop-request";

const MESSAGE_ID = "11111111-1111-4111-8111-111111111111";
const GENERATION_ID = "22222222-2222-4222-8222-222222222222";

describe("chat stop request identity", () => {
  it("accepts a fully fenced modern generation", () => {
    expect(
      chatStopRequestSchema.safeParse({
        messageId: MESSAGE_ID,
        generationId: GENERATION_ID,
      }).success,
    ).toBe(true);
  });

  it("keeps the unscoped shape only for the server's legacy-null fallback", () => {
    expect(chatStopRequestSchema.safeParse({}).success).toBe(true);
  });

  it("rejects partially fenced requests", () => {
    expect(
      chatStopRequestSchema.safeParse({ messageId: MESSAGE_ID }).success,
    ).toBe(false);
    expect(
      chatStopRequestSchema.safeParse({ generationId: GENERATION_ID }).success,
    ).toBe(false);
  });
});
