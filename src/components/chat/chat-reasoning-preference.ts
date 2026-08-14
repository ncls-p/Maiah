import {
  reasoningPresetSchema,
  type ReasoningPreset,
} from "@/modules/agent/reasoning-presets";

const STORAGE_PREFIX = "maiah-chat-reasoning";

function storageKey(workspaceId: string) {
  return `${STORAGE_PREFIX}:${workspaceId}`;
}

function parsePreset(value: unknown): ReasoningPreset | null {
  const parsed = reasoningPresetSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function readChatReasoningByAgent(
  workspaceId: string,
): Record<string, ReasoningPreset> {
  if (typeof window === "undefined") return {};
  try {
    const value = JSON.parse(
      window.localStorage.getItem(storageKey(workspaceId)) ?? "{}",
    ) as Record<string, unknown>;
    const next: Record<string, ReasoningPreset> = {};
    for (const [agentId, preset] of Object.entries(value)) {
      const parsed = parsePreset(preset);
      if (parsed) next[agentId] = parsed;
    }
    return next;
  } catch {
    return {};
  }
}

export function writeChatReasoningByAgent(
  workspaceId: string,
  reasoningByAgent: Record<string, ReasoningPreset>,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey(workspaceId),
      JSON.stringify(reasoningByAgent),
    );
  } catch {
    // Keep the in-memory selection when storage is unavailable.
  }
}
