import { describe,expect,it } from "vitest";

import type { ChatMessage } from "@/components/chat/chat-types";
import { toAiSdkUIMessages } from "@/modules/chat/ai-sdk-ui-messages";

function makeChatMessage(role: "user" | "assistant" | "system", parts: Array<{ type: string; content: string }>, id = "msg-1"): ChatMessage {
  return {
    id,
    role,
    status: "completed",
    parts,
    createdAt: new Date().toISOString(),
  };
}

describe("toAiSdkUIMessages", () => {
  it("converts citations parts", () => {
    const citations = [
      {
        chunkId: "chunk-1",
        documentId: "doc-1",
        documentTitle: "My Document",
        content: "Relevant content",
        score: 0.95,
      },
    ];
    const messages = [makeChatMessage("assistant", [{ type: "citations", content: JSON.stringify(citations) }])];
    const result = toAiSdkUIMessages(messages);

    const citationParts = result[0].parts.filter((p) => (p as { type: string }).type === "data-citations");
    expect(citationParts).toHaveLength(1);

    const sourceParts = result[0].parts.filter((p) => (p as { type: string }).type === "source-document");
    expect(sourceParts).toHaveLength(1);
  });

  it("ignores invalid citations content", () => {
    const messages = [makeChatMessage("assistant", [{ type: "citations", content: JSON.stringify([{ notValid: true }]) }])];
    const result = toAiSdkUIMessages(messages);

    const citationParts = result[0].parts.filter((p) => (p as { type: string }).type === "data-citations");
    expect(citationParts).toHaveLength(0);
  });

  it("converts code workspace artifact file parts", () => {
    const artifact = {
      kind: "code_workspace_artifact",
      projectId: "proj-1",
      title: "My Project",
      rootFile: "index.ts",
      version: 1,
      previewUrl: null,
      downloadUrl: "/download/proj-1",
      files: [
        {
          path: "index.ts",
          size: 100,
          mimeType: "text/typescript",
          binary: false,
          hash: "abc",
          updatedAt: "2024-01-01",
        },
      ],
    };
    const messages = [makeChatMessage("assistant", [{ type: "file", content: JSON.stringify(artifact) }])];
    const result = toAiSdkUIMessages(messages);

    const artifactParts = result[0].parts.filter((p) => (p as { type: string }).type === "data-code-workspace-artifact");
    expect(artifactParts).toHaveLength(1);
  });

  it("ignores unknown part types", () => {
    const messages = [makeChatMessage("assistant", [{ type: "unknown-type", content: "data" }])];
    const result = toAiSdkUIMessages(messages);

    // Only the message parts, no extra parts for unknown type
    expect(result).toHaveLength(1);
  });

  it("ignores tool-call parts without toolCallId", () => {
    const messages = [
      makeChatMessage("assistant", [
        {
          type: "tool-call",
          content: JSON.stringify({ toolName: "search" }),
        },
      ]),
    ];
    const result = toAiSdkUIMessages(messages);

    const toolParts = result[0].parts.filter((p) => (p as { type: string }).type === "dynamic-tool");
    expect(toolParts).toHaveLength(0);
  });

  it("handles multiple part types in one message", () => {
    const messages = [
      makeChatMessage("assistant", [
        { type: "text", content: "Here is the answer:" },
        { type: "reasoning", content: "Let me think..." },
        {
          type: "citations",
          content: JSON.stringify([
            {
              chunkId: "chunk-1",
              documentId: "doc-1",
              documentTitle: "Doc",
              content: "Content",
              score: 0.9,
            },
          ]),
        },
      ]),
    ];
    const result = toAiSdkUIMessages(messages);

    expect(result[0].parts.length).toBeGreaterThan(0);
    const types = result[0].parts.map((p) => (p as { type: string }).type);
    expect(types).toContain("text");
    expect(types).toContain("reasoning");
    expect(types).toContain("data-citations");
  });

  it("includes message metadata from ChatMessage", () => {
    const message: ChatMessage = {
      id: "msg-1",
      role: "assistant",
      status: "completed",
      parts: [{ type: "text", content: "Hello" }],
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    const result = toAiSdkUIMessages([message]);

    expect(result[0].id).toBe("msg-1");
    expect(result[0].metadata?.protocol).toBe("ai-hub-ui");
    expect(result[0].metadata?.createdAt).toBe("2024-01-01T00:00:00.000Z");
    expect(result[0].metadata?.status).toBe("completed");
  });

  it("handles empty messages array", () => {
    const result = toAiSdkUIMessages([]);
    expect(result).toEqual([]);
  });
});
