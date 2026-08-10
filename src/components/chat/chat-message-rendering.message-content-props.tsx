"use client";

import {
  type ChatMessage,
  type PendingToolApproval,
} from "@/components/chat/chat-types";
import { type WorkspaceArtifactDisplay } from "@/components/chat/code-workspace-artifact-card";

export type MessageContentProps = {
  message: ChatMessage;
  showSuggestions?: boolean;
  workspaceId?: string;
  workspaceArtifactDisplay?: WorkspaceArtifactDisplay;
  isEditing: boolean;
  editingContent: string;
  isSaving: boolean;
  isAnimating: boolean;
  onEditingContentChange?: (content: string) => void;
  onCancelEdit?: () => void;
  onSaveEdit?: () => void;
  pendingApprovals: PendingToolApproval[];
  onApproveTool?: (approval: PendingToolApproval) => void;
  onRejectTool?: (approval: PendingToolApproval) => void;
  onSuggestionClick?: (suggestion: string) => void;
};
