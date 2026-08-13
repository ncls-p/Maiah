import type { AgentVersion, ChatAgent } from "@/components/chat/chat-types";

export function isAssistantSelectionLoading(input: {
  workspaceLoading?: boolean;
  agentsLoading?: boolean;
  selectedAgent: ChatAgent | null;
  activeVersion: AgentVersion | null;
}): boolean {
  if (input.workspaceLoading || input.agentsLoading) return true;
  return Boolean(input.selectedAgent?.activeVersionId && !input.activeVersion);
}

export function assistantSelectionNeedsSetup(input: {
  isLoading: boolean;
  selectedAgent: ChatAgent | null;
  activeVersion: AgentVersion | null;
}): boolean {
  if (input.isLoading) return false;
  if (!input.selectedAgent) return true;
  if (input.selectedAgent.modelDisplayName) return false;
  if (input.activeVersion) {
    return !(input.activeVersion.providerId && input.activeVersion.modelId);
  }
  return !input.selectedAgent.activeVersionId;
}
