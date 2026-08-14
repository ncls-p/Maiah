import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  readChatReasoningByAgent,
  writeChatReasoningByAgent,
} from "@/components/chat/chat-reasoning-preference";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("chat reasoning preference", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists reasoning effort per assistant in a workspace", () => {
    writeChatReasoningByAgent("workspace-1", {
      "agent-1": "none",
      "agent-2": "xhigh",
    });

    expect(readChatReasoningByAgent("workspace-1")).toEqual({
      "agent-1": "none",
      "agent-2": "xhigh",
    });
    expect(readChatReasoningByAgent("workspace-2")).toEqual({});
  });

  it("drops invalid stored presets", () => {
    window.localStorage.setItem(
      "maiah-chat-reasoning:workspace-1",
      JSON.stringify({ "agent-1": "none", "agent-2": "bogus" }),
    );

    expect(readChatReasoningByAgent("workspace-1")).toEqual({
      "agent-1": "none",
    });
  });
});
