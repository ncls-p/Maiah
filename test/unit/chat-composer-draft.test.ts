import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  migrateNewChatComposerDraft,
  readChatComposerDraft,
  writeChatComposerDraft,
} from "@/components/chat/chat-composer-draft";
import type { ChatAttachment } from "@/components/chat/chat-types";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

const attachment: ChatAttachment = {
  kind: "chat_image",
  id: "attachment-1",
  fileName: "diagram.png",
  mimeType: "image/png",
  size: 2048,
  hash: "hash",
  url: "/uploads/diagram.png",
};

describe("chat composer drafts", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps text and attachments isolated per conversation", () => {
    writeChatComposerDraft("workspace-1", "agent-1", "conversation-1", {
      input: "First draft",
      attachments: [attachment],
    });
    writeChatComposerDraft("workspace-1", "agent-1", "conversation-2", {
      input: "Second draft",
      attachments: [],
    });

    expect(
      readChatComposerDraft("workspace-1", "agent-1", "conversation-1"),
    ).toEqual({ input: "First draft", attachments: [attachment] });
    expect(
      readChatComposerDraft("workspace-1", "agent-1", "conversation-2"),
    ).toEqual({ input: "Second draft", attachments: [] });
  });

  it("keeps unsent new-chat drafts isolated per assistant", () => {
    writeChatComposerDraft("workspace-1", "agent-1", null, {
      input: "Agent one",
      attachments: [],
    });
    writeChatComposerDraft("workspace-1", "agent-2", null, {
      input: "Agent two",
      attachments: [],
    });

    expect(readChatComposerDraft("workspace-1", "agent-1", null).input).toBe(
      "Agent one",
    );
    expect(readChatComposerDraft("workspace-1", "agent-2", null).input).toBe(
      "Agent two",
    );
  });

  it("moves the new-chat draft when the conversation is created", () => {
    writeChatComposerDraft("workspace-1", "agent-1", null, {
      input: "Follow-up while sending",
      attachments: [attachment],
    });

    migrateNewChatComposerDraft("workspace-1", "agent-1", "conversation-1");

    expect(
      readChatComposerDraft("workspace-1", "agent-1", "conversation-1"),
    ).toEqual({
      input: "Follow-up while sending",
      attachments: [attachment],
    });
    expect(readChatComposerDraft("workspace-1", "agent-1", null)).toEqual({
      input: "",
      attachments: [],
    });
  });

  it("drops malformed persisted attachment metadata", () => {
    window.localStorage.setItem(
      "maiah-chat-composer-draft:workspace-1:conversation-1",
      JSON.stringify({ input: "Safe text", attachments: [{ id: 42 }] }),
    );

    expect(
      readChatComposerDraft("workspace-1", "agent-1", "conversation-1"),
    ).toEqual({ input: "Safe text", attachments: [] });
  });
});
