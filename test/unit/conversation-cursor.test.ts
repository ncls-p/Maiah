import { describe, expect, it } from "vitest";

import {
  createConversationCursor,
  parseConversationCursor,
} from "@/app/api/workspace/conversations/route.query-schema";

describe("conversation list cursor", () => {
  it("round-trips every field used by the sidebar ordering", () => {
    const cursor = createConversationCursor({
      id: "conversation-2",
      updatedAt: new Date("2026-08-17T08:00:00.000Z"),
      pinnedAt: null,
      sidebarOrder: 2_000,
    });

    expect(cursor).toMatch(/^v2\./);
    expect(parseConversationCursor(cursor ?? undefined)).toEqual({
      version: 2,
      updatedAt: new Date("2026-08-17T08:00:00.000Z"),
      id: "conversation-2",
      pinned: false,
      sidebarOrder: 2_000,
    });
  });

  it("keeps accepting the previous cursor during a rolling deployment", () => {
    expect(
      parseConversationCursor("2026-08-17T08:00:00.000Z|conversation-legacy"),
    ).toEqual({
      version: 1,
      updatedAt: new Date("2026-08-17T08:00:00.000Z"),
      id: "conversation-legacy",
    });
  });

  it("rejects malformed cursors instead of silently returning the wrong page", () => {
    expect(parseConversationCursor("v2.not-json")).toBeNull();
    expect(parseConversationCursor("not-a-date|conversation")).toBeNull();
  });
});
