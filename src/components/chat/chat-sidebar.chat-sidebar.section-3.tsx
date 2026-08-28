import type * as React from "react";
import { useTranslations } from "next-intl";

import type { ChatConversation } from "@/components/chat/chat-types";
import { ConversationItem } from "./chat-sidebar.conversation-item";
import type { ChatSidebarProps } from "./chat-sidebar.default-workspace-nav-open";

export function ChatSidebarConversationRow({
  conversation,
  searchResult = false,
  activeConversationId,
  editingConversationId,
  editingTitle,
  agentNameById,
  t,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  onToggleConversationPin,
  onEditStart,
  onEditChange,
  onEditCancel,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onDragStart,
  onDragEnd,
  onDropBefore,
  isDragging,
  readOnly,
}: {
  conversation: ChatConversation;
  searchResult?: boolean;
  activeConversationId: ChatSidebarProps["activeConversationId"];
  editingConversationId: string | null;
  editingTitle: string;
  agentNameById: ReadonlyMap<string, string>;
  t: ReturnType<typeof useTranslations<"chat.sidebar">>;
  onSelectConversation: ChatSidebarProps["onSelectConversation"];
  onRenameConversation: ChatSidebarProps["onRenameConversation"];
  onDeleteConversation: ChatSidebarProps["onDeleteConversation"];
  onToggleConversationPin: ChatSidebarProps["onToggleConversationPin"];
  onEditStart: () => void;
  onEditChange: (title: string) => void;
  onEditCancel: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDropBefore: (event: React.DragEvent<HTMLDivElement>) => void;
  isDragging: boolean;
  readOnly: boolean;
}) {
  const targetConversationId =
    conversation.latestAssistantConversationId ?? conversation.id;
  const isActive =
    activeConversationId === conversation.id ||
    activeConversationId === targetConversationId;
  const isEditing = editingConversationId === conversation.id;
  const agentName = agentNameById.get(conversation.agentId) ?? t("assistant");

  return (
    <ConversationItem
      conversation={conversation}
      isActive={isActive}
      isEditing={isEditing}
      editingTitle={isEditing ? editingTitle : ""}
      agentName={agentName}
      onSelect={() =>
        onSelectConversation(targetConversationId, conversation.agentId)
      }
      onRename={(title) => {
        onRenameConversation?.(conversation.id, title);
        onEditCancel();
      }}
      onDelete={() => onDeleteConversation?.(conversation.id)}
      onEditStart={onEditStart}
      onEditChange={onEditChange}
      onEditCancel={onEditCancel}
      onTogglePin={() =>
        onToggleConversationPin?.(conversation.id, !conversation.pinnedAt)
      }
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      canMoveUp={canMoveUp}
      canMoveDown={canMoveDown}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDropBefore={onDropBefore}
      isDragging={isDragging}
      searchMatch={searchResult ? conversation.searchMatch : undefined}
      readOnly={readOnly}
    />
  );
}
