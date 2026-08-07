"use client";

export type ChatToolSource = "builtin" | "mcp" | "custom";

export type ChatCapabilityOverrides = {
  disabledTools: Array<{ source: ChatToolSource; id: string }>;
  disabledSkillIds: string[];
  enabledTools: Array<{ source: ChatToolSource; id: string }>;
  enabledSkillIds: string[];
  enabledKnowledgeIds: string[];
};

const STORAGE_PREFIX = "maiah-chat-capabilities";

function storageKey(agentId: string, conversationId: string | null) {
  return `${STORAGE_PREFIX}:${conversationId ?? `draft:${agentId}`}`;
}

function emptyOverrides(): ChatCapabilityOverrides {
  return { disabledTools: [], disabledSkillIds: [], enabledTools: [], enabledSkillIds: [], enabledKnowledgeIds: [] };
}

export function readChatCapabilityOverrides(agentId: string | null, conversationId: string | null): ChatCapabilityOverrides {
  if (typeof window === "undefined" || !agentId) return emptyOverrides();
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey(agentId, conversationId)) ?? "{}") as Partial<ChatCapabilityOverrides>;
    return {
      disabledTools: Array.isArray(value.disabledTools) ? value.disabledTools.filter((tool): tool is { source: ChatToolSource; id: string } => Boolean(tool && ["builtin", "mcp", "custom"].includes(tool.source) && typeof tool.id === "string")) : [],
      disabledSkillIds: Array.isArray(value.disabledSkillIds) ? value.disabledSkillIds.filter((skillId): skillId is string => typeof skillId === "string") : [],
      enabledTools: Array.isArray(value.enabledTools) ? value.enabledTools.filter((tool): tool is { source: ChatToolSource; id: string } => Boolean(tool && ["builtin", "mcp", "custom"].includes(tool.source) && typeof tool.id === "string")) : [],
      enabledSkillIds: Array.isArray(value.enabledSkillIds) ? value.enabledSkillIds.filter((id): id is string => typeof id === "string") : [],
      enabledKnowledgeIds: Array.isArray(value.enabledKnowledgeIds) ? value.enabledKnowledgeIds.filter((id): id is string => typeof id === "string") : [],
    };
  } catch {
    return emptyOverrides();
  }
}

export function writeChatCapabilityOverrides(agentId: string, conversationId: string | null, overrides: ChatCapabilityOverrides) {
  window.localStorage.setItem(storageKey(agentId, conversationId), JSON.stringify(overrides));
}

export function migrateDraftCapabilityOverrides(agentId: string, conversationId: string) {
  const draftKey = storageKey(agentId, null);
  const draft = window.localStorage.getItem(draftKey);
  if (!draft) return;
  window.localStorage.setItem(storageKey(agentId, conversationId), draft);
  window.localStorage.removeItem(draftKey);
}
