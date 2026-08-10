import { describe, expect, it, vi } from "vitest";

import {
  getConversationMessages,
  recordUsageEvent,
} from "@/modules/agent/use-cases";
import { dbModule } from "./agent-use-cases.test.chain";

// ─── getConversationMessages ──────────────────────────────────────────

describe("getConversationMessages", () => {
  it("returns empty array when no messages", async () => {
    dbModule._c.orderBy.mockResolvedValueOnce([]);
    const result = await getConversationMessages("conv-1");
    expect(result).toHaveLength(0);
  });

  it("decrypts text parts", async () => {
    const { decryptValue } = await import("@/lib/crypto");
    const msg = {
      id: "msg-1",
      role: "user",
      status: "complete",
      createdAt: new Date(),
    };
    const part = {
      id: "part-1",
      messageId: "msg-1",
      type: "text",
      contentEncrypted: "enc:text",
      sortOrder: 0,
      metadataJson: null,
    };

    // Q1: messages orderBy
    // Q2: messageParts orderBy (for each message)
    dbModule._c.orderBy
      .mockResolvedValueOnce([msg]) // messages
      .mockResolvedValueOnce([part]); // parts for msg-1

    const result = await getConversationMessages("conv-1");

    expect(result).toHaveLength(1);
    expect(result[0].parts).toHaveLength(1);
    expect(decryptValue).toHaveBeenCalledWith("enc:text");
  });

  it("keeps an empty reasoning part as a durable lifecycle indicator", async () => {
    const { decryptValue } = await import("@/lib/crypto");
    vi.mocked(decryptValue).mockResolvedValueOnce("");
    const msg = {
      id: "msg-1",
      role: "assistant",
      status: "completed",
      createdAt: new Date(),
    };
    const part = {
      id: "part-1",
      messageId: "msg-1",
      type: "reasoning",
      contentEncrypted: "enc:empty",
      sortOrder: 0,
      metadataJson: null,
    };
    dbModule._c.orderBy
      .mockResolvedValueOnce([msg])
      .mockResolvedValueOnce([part]);

    const result = await getConversationMessages("conv-1");

    expect(result[0].parts).toEqual([{ type: "reasoning", content: "" }]);
    expect(decryptValue).toHaveBeenCalledWith("enc:empty");
  });

  it("handles decryption failure gracefully", async () => {
    const { decryptValue } = await import("@/lib/crypto");
    vi.mocked(decryptValue).mockRejectedValueOnce(new Error("Key error"));

    const msg = {
      id: "msg-1",
      role: "user",
      status: "complete",
      createdAt: new Date(),
    };
    const part = {
      id: "part-1",
      messageId: "msg-1",
      type: "text",
      contentEncrypted: "enc:bad",
      sortOrder: 0,
      metadataJson: null,
    };

    dbModule._c.orderBy
      .mockResolvedValueOnce([msg])
      .mockResolvedValueOnce([part]);

    const result = await getConversationMessages("conv-1");
    expect(result[0].parts[0].content).toBe("[decryption failed]");
  });

  it("returns metadata JSON for non-text parts", async () => {
    const msg = {
      id: "msg-1",
      role: "assistant",
      status: "complete",
      createdAt: new Date(),
    };
    const meta = { toolName: "calculator", input: { expression: "1+1" } };
    const part = {
      id: "part-2",
      messageId: "msg-1",
      type: "tool_use",
      contentEncrypted: null,
      sortOrder: 0,
      metadataJson: meta,
    };

    dbModule._c.orderBy
      .mockResolvedValueOnce([msg])
      .mockResolvedValueOnce([part]);

    const result = await getConversationMessages("conv-1");
    expect(result[0].parts[0].content).toBe(JSON.stringify(meta));
  });

  it("redacts historical tool metadata before returning conversation data", async () => {
    const msg = {
      id: "msg-1",
      role: "assistant",
      status: "complete",
      createdAt: new Date(),
    };
    const part = {
      id: "part-2",
      messageId: "msg-1",
      type: "tool-call",
      contentEncrypted: null,
      sortOrder: 0,
      metadataJson: {
        toolName: "webhook",
        input: { apiKey: "hidden", maxOutputTokens: 256 },
      },
    };
    dbModule._c.orderBy
      .mockResolvedValueOnce([msg])
      .mockResolvedValueOnce([part]);

    const result = await getConversationMessages("conv-1");

    expect(JSON.parse(result[0].parts[0].content)).toEqual({
      toolName: "webhook",
      input: { apiKey: "[REDACTED]", maxOutputTokens: 256 },
    });
  });
});

// ─── recordUsageEvent ─────────────────────────────────────────────────

describe("recordUsageEvent", () => {
  it("inserts a usage event", async () => {
    await recordUsageEvent({
      workspaceId: "ws-1",
      userId: "user-1",
      operation: "chat.completion",
      inputTokens: 100,
      outputTokens: 50,
      latencyMs: 200,
    });

    expect(dbModule.db.insert).toHaveBeenCalled();
    expect(dbModule._c.values).toHaveBeenCalled();
  });

  it("handles optional fields being undefined", async () => {
    await recordUsageEvent({
      workspaceId: "ws-1",
      userId: "user-1",
      operation: "chat.completion",
    });

    const insertValues = dbModule._c.values.mock.calls[0][0];
    expect(insertValues.inputTokens).toBeNull();
    expect(insertValues.outputTokens).toBeNull();
  });

  it("does not break a completed workflow when telemetry is unavailable", async () => {
    dbModule._c.values.mockRejectedValueOnce(
      new Error("telemetry unavailable"),
    );

    await expect(
      recordUsageEvent({
        workspaceId: "ws-1",
        userId: "user-1",
        operation: "chat.completion.failed",
      }),
    ).resolves.toBeUndefined();
  });
});
