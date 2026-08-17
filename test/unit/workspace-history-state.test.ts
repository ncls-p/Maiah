import { describe, expect, it, vi } from "vitest";

import type { ChatConversation } from "@/components/chat/chat-types";
import {
  queueWorkspaceHistoryRefresh,
  resolveWorkspaceHistoryLiveIds,
  resolveWorkspaceHistorySearchState,
  settleWorkspaceHistoryRefresh,
} from "@/components/workspace-history-sidebar.state";

function conversation(
  id: string,
  live?: { isStreaming?: boolean; isUnread?: boolean },
): ChatConversation {
  return {
    id,
    title: id,
    agentId: "agent-1",
    updatedAt: "2026-08-17T12:00:00.000Z",
    ...live,
  };
}

describe("workspace history refresh coordination", () => {
  it("coalesces concurrent refreshes and runs one trailing fetch", async () => {
    const first = queueWorkspaceHistoryRefresh(null);
    const second = queueWorkspaceHistoryRefresh(first.cycle);

    expect(first.shouldFetch).toBe(true);
    expect(second.shouldFetch).toBe(false);
    expect(second.cycle).toBe(first.cycle);
    expect(second.cycle.promise).toBe(first.cycle.promise);
    expect(settleWorkspaceHistoryRefresh(first.cycle)).toBe("refetch");

    const resolved = vi.fn();
    void first.cycle.promise.then(resolved);
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();

    expect(settleWorkspaceHistoryRefresh(first.cycle)).toBe("complete");
    await first.cycle.promise;
    expect(resolved).toHaveBeenCalledOnce();
  });
});

describe("workspace history search scoping", () => {
  it("keeps the loading state through debounce and workspace changes", () => {
    expect(
      resolveWorkspaceHistorySearchState({
        query: "incident",
        workspaceId: "workspace-b",
        resultWorkspaceId: "workspace-a",
        results: [conversation("from-a")],
        inFlight: false,
        failed: true,
      }),
    ).toEqual({ results: [], searching: true, error: false });
  });

  it("exposes only the current workspace result or error", () => {
    const results = [conversation("from-b")];
    expect(
      resolveWorkspaceHistorySearchState({
        query: "incident",
        workspaceId: "workspace-b",
        resultWorkspaceId: "workspace-b",
        results,
        inFlight: false,
        failed: false,
      }),
    ).toEqual({ results, searching: false, error: false });
    expect(
      resolveWorkspaceHistorySearchState({
        query: "incident",
        workspaceId: "workspace-b",
        resultWorkspaceId: "workspace-b",
        results: [],
        inFlight: false,
        failed: true,
      }),
    ).toEqual({ results: [], searching: false, error: true });
  });
});

describe("workspace history optimistic live state", () => {
  it("applies false overrides only within their server revision", () => {
    const conversations = [
      conversation("active", { isStreaming: true, isUnread: true }),
    ];
    const optimistic = {
      workspaceId: "workspace-a",
      streaming: new Map([["active", { value: false, serverRevision: 4 }]]),
      unread: new Map([["active", { value: false, serverRevision: 4 }]]),
    };

    expect(
      resolveWorkspaceHistoryLiveIds(
        conversations,
        optimistic,
        "workspace-a",
        4,
      ),
    ).toEqual({ streamingIds: new Set(), unreadIds: new Set() });
    expect(
      resolveWorkspaceHistoryLiveIds(
        conversations,
        optimistic,
        "workspace-a",
        5,
      ),
    ).toEqual({
      streamingIds: new Set(["active"]),
      unreadIds: new Set(),
    });
  });

  it("does not leak optimistic state across workspaces", () => {
    expect(
      resolveWorkspaceHistoryLiveIds(
        [conversation("server")],
        {
          workspaceId: "workspace-a",
          streaming: new Map([
            ["optimistic", { value: true, serverRevision: 2 }],
          ]),
          unread: new Map(),
        },
        "workspace-b",
        2,
      ),
    ).toEqual({ streamingIds: new Set(), unreadIds: new Set() });
  });
});
