import { describe, expect, it } from "vitest";

import { buildConversationAttachmentContext } from "@/modules/chat/conversation-attachment-context";

describe("conversation attachment context", () => {
  it("keeps historical readable files explicit for follow-up turns", () => {
    const context = buildConversationAttachmentContext([
      {
        kind: "chat_file",
        id: "00000000-0000-4000-8000-000000000099",
        fileName: "server.log",
        mimeType: "text/plain",
        size: 42_000,
        hash: "hash",
        url: "/api/workspace/chat-attachments/file",
        category: "document",
        extractionStatus: "readable",
        extractedTextChars: 41_000,
      },
    ]);

    expect(context).toContain("server.log");
    expect(context).toContain("00000000-0000-4000-8000-000000000099");
    expect(context).toContain("remain available");
    expect(context).toContain("do not claim that no file was attached");
  });

  it("omits the context when the conversation has no attachments", () => {
    expect(buildConversationAttachmentContext([])).toBeNull();
  });
});
