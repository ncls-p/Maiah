import { describe, expect, it } from "vitest";

import {
  conversationFolderOpenStorageKey,
  EMPTY_CONVERSATION_FOLDER_OPEN_SNAPSHOT,
  normalizeConversationFolderOpenSnapshot,
  parseConversationFolderOpenSnapshot,
  serializeConversationFolderOpenSnapshot,
  updateConversationFolderOpenSnapshot,
} from "@/lib/conversation-folder-visibility";

describe("conversation folder visibility", () => {
  it("keeps folders closed by default", () => {
    expect(parseConversationFolderOpenSnapshot(null)).toEqual(new Set());
    expect(normalizeConversationFolderOpenSnapshot(undefined)).toBe(
      EMPTY_CONVERSATION_FOLDER_OPEN_SNAPSHOT,
    );
  });

  it("builds an isolated key for each user and workspace", () => {
    expect(
      conversationFolderOpenStorageKey({
        userId: " user/1 ",
        workspaceId: " workspace:1 ",
      }),
    ).toBe("chat-conversation-folder-open:v1:user%2F1:workspace%3A1");
    expect(
      conversationFolderOpenStorageKey({ userId: "", workspaceId: "w1" }),
    ).toBeNull();
    expect(
      conversationFolderOpenStorageKey({ userId: "u1", workspaceId: null }),
    ).toBeNull();
  });

  it("normalizes malformed and duplicated browser values", () => {
    expect(normalizeConversationFolderOpenSnapshot("not-json")).toBe("[]");
    expect(normalizeConversationFolderOpenSnapshot('{"folder":"one"}')).toBe(
      "[]",
    );
    expect(
      normalizeConversationFolderOpenSnapshot(
        JSON.stringify([" folder-b ", "folder-a", "folder-a", 42, ""]),
      ),
    ).toBe('["folder-a","folder-b"]');
  });

  it("serializes folder identifiers deterministically", () => {
    expect(
      serializeConversationFolderOpenSnapshot([
        "folder-b",
        "folder-a",
        "folder-b",
      ]),
    ).toBe('["folder-a","folder-b"]');
  });

  it("persists open and closed choices", () => {
    const opened = updateConversationFolderOpenSnapshot({
      snapshot: "[]",
      folderId: "folder-1",
      open: true,
    });
    expect(opened).toBe('["folder-1"]');

    expect(
      updateConversationFolderOpenSnapshot({
        snapshot: opened,
        folderId: "folder-1",
        open: false,
      }),
    ).toBe("[]");
    expect(
      updateConversationFolderOpenSnapshot({
        snapshot: opened,
        folderId: "   ",
        open: true,
      }),
    ).toBe(opened);
  });
});
