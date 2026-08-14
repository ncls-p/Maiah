"use client";

import { useState } from "react";

import {
  readChatReasoningByAgent,
  writeChatReasoningByAgent,
} from "@/components/chat/chat-reasoning-preference";
import type { AgentVersion } from "@/components/chat/chat-types";
import {
  defaultReasoningPreset,
  normalizeReasoningPresets,
  type ReasoningPreset,
} from "@/modules/agent/reasoning-presets";

export function useReasoningEffort(
  workspaceId: string | null | undefined,
  selectedAgentId: string | null,
  activeVersion: AgentVersion | null,
) {
  const [reasoningByAgent, setReasoningByAgent] = useState<
    Record<string, ReasoningPreset>
  >({});
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState<string | null>(
    null,
  );
  if (workspaceId && workspaceId !== loadedWorkspaceId) {
    setLoadedWorkspaceId(workspaceId);
    setReasoningByAgent((current) => ({
      ...readChatReasoningByAgent(workspaceId),
      ...current,
    }));
  }
  const reasoningPresets = normalizeReasoningPresets(
    activeVersion?.generationSettingsJson?.reasoningPresets,
  );
  const configuredReasoningEffort = selectedAgentId
    ? reasoningByAgent[selectedAgentId]
    : undefined;
  const reasoningEffort =
    configuredReasoningEffort &&
    reasoningPresets.includes(configuredReasoningEffort)
      ? configuredReasoningEffort
      : defaultReasoningPreset(reasoningPresets);

  function setReasoningEffort(value: ReasoningPreset) {
    if (!selectedAgentId || !reasoningPresets.includes(value)) return;
    setReasoningByAgent((current) => {
      const next = { ...current, [selectedAgentId]: value };
      if (workspaceId) writeChatReasoningByAgent(workspaceId, next);
      return next;
    });
  }

  return { reasoningPresets, reasoningEffort, setReasoningEffort };
}
