import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";

import {
migrateDraftCapabilityOverrides,
readChatCapabilityOverrides,
writeChatCapabilityOverrides,
} from "@/components/chat/chat-capability-overrides";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("chat capability overrides", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps tools, MCP servers, and skills scoped per conversation", () => {
    writeChatCapabilityOverrides("agent-1", "conversation-1", {
      disabledTools: [
        { source: "builtin", id: "web-search" },
        { source: "mcp", id: "github" },
      ],
      disabledSkillIds: ["frontend-design"],
    });

    expect(
      readChatCapabilityOverrides("agent-1", "conversation-1"),
    ).toEqual({
      disabledTools: [
        { source: "builtin", id: "web-search" },
        { source: "mcp", id: "github" },
      ],
      disabledSkillIds: ["frontend-design"],
    });
    expect(
      readChatCapabilityOverrides("agent-1", "conversation-2"),
    ).toEqual({ disabledTools: [], disabledSkillIds: [] });
  });

  it("migrates the full capability selection to a newly created chat", () => {
    writeChatCapabilityOverrides("agent-1", null, {
      disabledTools: [{ source: "mcp", id: "notion" }],
      disabledSkillIds: ["research"],
    });

    migrateDraftCapabilityOverrides("agent-1", "conversation-1");

    expect(
      readChatCapabilityOverrides("agent-1", "conversation-1"),
    ).toEqual({
      disabledTools: [{ source: "mcp", id: "notion" }],
      disabledSkillIds: ["research"],
    });
    expect(readChatCapabilityOverrides("agent-1", null)).toEqual({
      disabledTools: [],
      disabledSkillIds: [],
    });
  });
});
