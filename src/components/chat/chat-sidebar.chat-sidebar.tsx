"use client";
import { FolderPlusIcon, MessageSquareIcon, PanelLeftOpenIcon, PlusIcon, PanelLeftCloseIcon, ChevronDownIcon, FolderIcon, MoreHorizontalIcon, PencilIcon, PinIcon, Trash2Icon, RefreshCwIcon, SearchXIcon, CheckIcon, MessageSquarePlusIcon, SearchIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";
import { useMemo, useState } from "react";
import { ChatConversation, ChatConversationFolder } from "@/components/chat/chat-types";
import { SidebarFooter, SidebarHeader } from "@/components/sidebar-chrome";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConversationFolderVisibility } from "@/hooks/use-conversation-folder-visibility";
import { cn } from "@/lib/utils";
import { buildMenuGroups } from "@/modules/navigation/sidebar-config";
import { BUTTON_TYPE, ChatSidebarProps, GHOST_VARIANT } from "./chat-sidebar.default-workspace-nav-open";
import { TemporaryConversationButton } from "./temporary-conversation-button";
import { ConversationItem } from "./chat-sidebar.conversation-item";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatAppNavigation } from "./chat-sidebar.chat-app-navigation";

export function useChatSidebarController({
  agents,
  conversations,
  conversationFolders,
  activeConversationId,
  loading,
  searchQuery = "",
  searchResults = [],
  searching = false,
  searchError = false,
  hasMoreSearchResults = false,
  loadingMoreSearchResults = false,
  onSearchQueryChange,
  onRetrySearch,
  onLoadMoreSearchResults,
  onSelectConversation,
  onNewConversation,
  onNewTemporaryConversation,
  onRenameConversation,
  onDeleteConversation,
  onCreateConversationFolder,
  onRenameConversationFolder,
  onDeleteConversationFolder,
  onToggleConversationPin,
  onReorderConversations,
  hasMoreConversations,
  loadingMoreConversations,
  onLoadMoreConversations,
  collapsed,
  onCollapsedChange,
  className,
  shell,
  workspaceId,
  readOnly = false,
  showWorkspaceNavigation = true,
  footerContent,
}: ChatSidebarProps) {
  const t = useTranslations("chat.sidebar");
  const [editingConversationId, setEditingConversationId] = useState<
    string | null
  >(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const { openFolderIds, setFolderOpen } = useConversationFolderVisibility({
    workspaceId,
    userId: shell?.currentUserId,
  });
  const [draggingConversationId, setDraggingConversationId] = useState<
    string | null
  >(null);
  const agentNameById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent.name])),
    [agents],
  );
  const navGroups = useMemo(
    () => (shell ? buildMenuGroups(shell) : []),
    [shell],
  );
  const searchActive = searchQuery.trim().length > 0;
  const sortedConversations = useMemo(
    () => sortConversations(conversations),
    [conversations],
  );
  const buckets = useMemo(
    () => deriveConversationBuckets(sortedConversations, conversationFolders),
    [sortedConversations, conversationFolders],
  );
  const pinnedConversations = buckets.pinned;
  const topLevelConversations = buckets.topLevel;
  const folderSections = buckets.folders;
  function reorderDraggedConversation({
    folderId,
    pinned,
    beforeId,
  }: {
    folderId: string | null;
    pinned: boolean;
    beforeId?: string;
  }) {
    if (!draggingConversationId || !onReorderConversations) return;
    if (beforeId === draggingConversationId) {
      setDraggingConversationId(null);
      return;
    }
    const destinationItems = pinned
      ? pinnedConversations
      : folderId
        ? (folderSections.find((section) => section.folder.id === folderId)
            ?.conversations ?? [])
        : topLevelConversations;
    onReorderConversations({
      conversationIds: orderedIdsWithInsertion(
        destinationItems,
        draggingConversationId,
        beforeId,
      ),
      folderId,
      pinned,
    });
    setDraggingConversationId(null);
  }

  function handleConversationDrop(
    event: React.DragEvent<HTMLDivElement>,
    conversation: ChatConversation,
  ) {
    event.preventDefault();
    event.stopPropagation();
    reorderDraggedConversation({
      folderId: conversation.pinnedAt ? null : (conversation.folderId ?? null),
      pinned: Boolean(conversation.pinnedAt),
      beforeId: conversation.id,
    });
  }

  function startFolderCreate() {
    setCreatingFolder(true);
    setNewFolderName("");
  }

  function saveNewFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    onCreateConversationFolder?.(name);
    setCreatingFolder(false);
    setNewFolderName("");
  }

  function renderHistoryActions() {
    if (readOnly || !onCreateConversationFolder) return null;

    return (
      <div
        role="toolbar"
        aria-label={t("historyActions")}
        className="flex min-h-10 shrink-0 items-center justify-end gap-1"
      >
        <Button
          type={BUTTON_TYPE}
          size="icon-sm"
          variant={GHOST_VARIANT}
          className="size-10 rounded-xl text-muted-foreground transition-[background-color,color,scale] active:scale-[0.96]"
          aria-label={t("createFolder")}
          title={t("createFolder")}
          onClick={startFolderCreate}
        >
          <FolderPlusIcon className="size-4" aria-hidden="true" />
        </Button>
      </div>
    );
  }

  function renderConversation(
    conversation: ChatConversation,
    options?: { searchResult?: boolean },
  ) {
    return (
      <ChatSidebarConversationRow
        key={conversation.id}
        conversation={conversation}
        searchResult={options?.searchResult}
        activeConversationId={activeConversationId}
        editingConversationId={editingConversationId}
        editingTitle={editingTitle}
        agentNameById={agentNameById}
        t={t}
        onSelectConversation={onSelectConversation}
        onRenameConversation={onRenameConversation}
        onDeleteConversation={onDeleteConversation}
        onToggleConversationPin={onToggleConversationPin}
        onEditStart={() => {
          setEditingConversationId(conversation.id);
          setEditingTitle(conversation.title);
        }}
        onEditChange={setEditingTitle}
        onEditCancel={() => setEditingConversationId(null)}
        onMoveUp={() =>
          moveConversation(conversation, buckets, -1, onReorderConversations)
        }
        onMoveDown={() =>
          moveConversation(conversation, buckets, 1, onReorderConversations)
        }
        canMoveUp={canMoveConversation(
          conversation,
          buckets,
          Boolean(onReorderConversations),
          -1,
        )}
        canMoveDown={canMoveConversation(
          conversation,
          buckets,
          Boolean(onReorderConversations),
          1,
        )}
        onDragStart={(event) => {
          setDraggingConversationId(conversation.id);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", conversation.id);
        }}
        onDragEnd={() => setDraggingConversationId(null)}
        onDropBefore={(event) => handleConversationDrop(event, conversation)}
        isDragging={draggingConversationId === conversation.id}
        readOnly={readOnly || conversation.isOwner === false}
      />
    );
  }

  if (collapsed) {
    return (
      <div
        className={cn(
          "flex h-full min-h-0 flex-col items-center gap-1 bg-transparent",
          className,
        )}
      >
        <SidebarHeader
          contextLabel={t("conversations")}
          collapsed
          action={
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type={BUTTON_TYPE}
                  size="icon"
                  variant={GHOST_VARIANT}
                  aria-label={t("expandSidebar")}
                  onClick={() => onCollapsedChange?.(false)}
                  className="size-10 rounded-xl"
                >
                  <PanelLeftOpenIcon className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{t("expandSidebar")}</TooltipContent>
            </Tooltip>
          }
        />
        {onNewTemporaryConversation ? (
          <TemporaryConversationButton
            onSelect={onNewTemporaryConversation}
            tooltipSide="right"
          />
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type={BUTTON_TYPE}
              size="icon"
              variant={GHOST_VARIANT}
              aria-label={t("newConversation")}
              onClick={onNewConversation}
              className="size-10 rounded-xl"
            >
              <PlusIcon className="size-4" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{t("newConversation")}</TooltipContent>
        </Tooltip>
        <div className="mt-1 flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto py-1">
          {sortedConversations.slice(0, 10).map((conversation) => (
            <Tooltip key={conversation.id}>
              <TooltipTrigger asChild>
                <Button
                  type={BUTTON_TYPE}
                  size="icon"
                  variant={
                    activeConversationId === conversation.id ||
                    activeConversationId ===
                      conversation.latestAssistantConversationId
                      ? "secondary"
                      : "ghost"
                  }
                  aria-label={conversation.title}
                  onClick={() =>
                    onSelectConversation(
                      conversation.latestAssistantConversationId ??
                        conversation.id,
                    )
                  }
                  className={cn(
                    "size-10 rounded-xl transition-[background-color,color]",
                    (activeConversationId === conversation.id ||
                      activeConversationId ===
                        conversation.latestAssistantConversationId) &&
                      "bg-sidebar-accent text-sidebar-accent-foreground",
                  )}
                >
                  <MessageSquareIcon className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{conversation.title}</TooltipContent>
            </Tooltip>
          ))}
        </div>
        <SidebarFooter displayName={shell?.displayName} collapsed />
      </div>
    );
  }

  return {
    kind: "ready",
    className,
    conversationFolders,
    conversations,
    creatingFolder,
    editingFolderId,
    editingFolderName,
    folderSections,
    footerContent,
    hasMoreConversations,
    hasMoreSearchResults,
    loading,
    loadingMoreConversations,
    loadingMoreSearchResults,
    navGroups,
    newFolderName,
    onCollapsedChange,
    onDeleteConversationFolder,
    onLoadMoreConversations,
    onLoadMoreSearchResults,
    onNewConversation,
    onNewTemporaryConversation,
    onRenameConversationFolder,
    onRetrySearch,
    onSearchQueryChange,
    openFolderIds,
    pinnedConversations,
    readOnly,
    renderConversation,
    renderHistoryActions,
    reorderDraggedConversation,
    saveNewFolder,
    searchActive,
    searchError,
    searchQuery,
    searchResults,
    searching,
    setCreatingFolder,
    setEditingFolderId,
    setEditingFolderName,
    setFolderOpen,
    setNewFolderName,
    shell,
    showWorkspaceNavigation,
    t,
    topLevelConversations,
  } as const;
}

export function ChatSidebar(
  ...args: Parameters<typeof useChatSidebarController>
) {
  const model = useChatSidebarController(...args);
  if (!("kind" in model)) return model;
  return <ChatSidebarView model={model} />;
}


export type ChatSidebarViewModel = Extract<
  ReturnType<typeof useChatSidebarController>,
  { kind: "ready" }
>;
export function ChatSidebarView({ model }: { model: ChatSidebarViewModel }) {
  const { className, footerContent, onCollapsedChange, readOnly, shell, t } =
    model;
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col bg-transparent text-sidebar-foreground",
        className,
      )}
    >
      <SidebarHeader
        contextLabel={t("conversations")}
        action={
          !readOnly && onCollapsedChange ? (
            <Button
              type={BUTTON_TYPE}
              size="icon-sm"
              variant={GHOST_VARIANT}
              className="size-10 shrink-0 rounded-xl text-muted-foreground transition-[background-color,color,scale] hover:bg-sidebar-accent/70 hover:text-sidebar-foreground active:scale-[0.96]"
              aria-label={t("collapseSidebar")}
              title={t("collapseSidebar")}
              onClick={() => onCollapsedChange(true)}
            >
              <PanelLeftCloseIcon className="size-4" aria-hidden="true" />
            </Button>
          ) : null
        }
      />

      <ChatSidebarSection1 model={model} />
      {footerContent ?? <SidebarFooter displayName={shell?.displayName} />}
    </div>
  );
}


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
                onToggleConversationPin?.(
                    conversation.id,
                    !conversation.pinnedAt,
                )
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


export function sortConversations(
  conversations: ChatConversation[],
): ChatConversation[] {
  return [...conversations].sort((a, b) => {
    const aPinned = a.pinnedAt ? 0 : 1;
    const bPinned = b.pinnedAt ? 0 : 1;
    if (aPinned !== bPinned) return aPinned - bPinned;

    const aHasManualOrder =
      a.sidebarOrder !== null && a.sidebarOrder !== undefined;
    const bHasManualOrder =
      b.sidebarOrder !== null && b.sidebarOrder !== undefined;
    if (aHasManualOrder !== bHasManualOrder) {
      return aHasManualOrder ? 1 : -1;
    }

    if (
      aHasManualOrder &&
      bHasManualOrder &&
      a.sidebarOrder !== b.sidebarOrder
    ) {
      return (a.sidebarOrder ?? 0) - (b.sidebarOrder ?? 0);
    }

    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export interface ConversationFolderSection {
  folder: ChatConversationFolder;
  conversations: ChatConversation[];
}

export interface ConversationBuckets {
  pinned: ChatConversation[];
  topLevel: ChatConversation[];
  folders: ConversationFolderSection[];
}

export function deriveConversationBuckets(
  sorted: ChatConversation[],
  conversationFolders: ChatConversationFolder[],
): ConversationBuckets {
  const unpinned = sorted.filter((conversation) => !conversation.pinnedAt);
  return {
    pinned: sorted.filter((conversation) => conversation.pinnedAt),
    topLevel: unpinned.filter((conversation) => !conversation.folderId),
    folders: conversationFolders.map((folder) => ({
      folder,
      conversations: unpinned.filter(
        (conversation) => conversation.folderId === folder.id,
      ),
    })),
  };
}

export function orderedIdsWithInsertion(
  items: ChatConversation[],
  draggedId: string,
  beforeId?: string,
): string[] {
  const ids = items
    .map((conversation) => conversation.id)
    .filter((id) => id !== draggedId);
  const insertionIndex = beforeId ? ids.indexOf(beforeId) : -1;
  ids.splice(insertionIndex >= 0 ? insertionIndex : ids.length, 0, draggedId);
  return ids;
}

export function conversationItems(
  conversation: ChatConversation,
  buckets: ConversationBuckets,
): ChatConversation[] {
  const pinned = Boolean(conversation.pinnedAt);
  const folderId = pinned ? null : (conversation.folderId ?? null);
  return pinned
    ? buckets.pinned
    : folderId
      ? (buckets.folders.find((section) => section.folder.id === folderId)
          ?.conversations ?? [])
      : buckets.topLevel;
}

export function canMoveConversation(
  conversation: ChatConversation,
  buckets: ConversationBuckets,
  reorderAvailable: boolean,
  delta: -1 | 1,
): boolean {
  if (!reorderAvailable) return false;
  const items = conversationItems(conversation, buckets);
  const currentIndex = items.findIndex((item) => item.id === conversation.id);
  const nextIndex = currentIndex + delta;
  return currentIndex >= 0 && nextIndex >= 0 && nextIndex < items.length;
}

export function moveConversation(
  conversation: ChatConversation,
  buckets: ConversationBuckets,
  delta: -1 | 1,
  onReorderConversations: ChatSidebarProps["onReorderConversations"],
): void {
  if (!onReorderConversations) return;
  const pinned = Boolean(conversation.pinnedAt);
  const folderId = pinned ? null : (conversation.folderId ?? null);
  const items = conversationItems(conversation, buckets);
  const currentIndex = items.findIndex((item) => item.id === conversation.id);
  const nextIndex = currentIndex + delta;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= items.length) return;

  const conversationIds = items.map((item) => item.id);
  const [conversationId] = conversationIds.splice(currentIndex, 1);
  if (!conversationId) return;
  conversationIds.splice(nextIndex, 0, conversationId);
  onReorderConversations({ conversationIds, folderId, pinned });
}


export function ChatSidebarListsBranch1({
  model,
}: {
  model: ChatSidebarViewModel;
}) {
  const {
    editingFolderId,
    editingFolderName,
    folderSections,
    hasMoreConversations,
    loadingMoreConversations,
    onDeleteConversationFolder,
    onLoadMoreConversations,
    onRenameConversationFolder,
    openFolderIds,
    pinnedConversations,
    readOnly,
    renderConversation,
    reorderDraggedConversation,
    setEditingFolderId,
    setEditingFolderName,
    setFolderOpen,
    t,
    topLevelConversations,
  } = model;
  return (
    <div className="flex flex-col gap-3">
      {pinnedConversations.length > 0 ? (
        <section
          className="flex flex-col gap-px"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            reorderDraggedConversation({
              folderId: null,
              pinned: true,
            });
          }}
        >
          <div className="flex items-center gap-1 px-2 pb-1 text-[11px] font-medium text-muted-foreground">
            <PinIcon className="size-3" aria-hidden="true" />
            {t("pinned")}
          </div>
          {pinnedConversations.map((conversation) =>
            renderConversation(conversation),
          )}
        </section>
      ) : null}

      {folderSections.map(({ folder, conversations: folderConversations }) => {
        const open = openFolderIds.has(folder.id);
        const isEditingFolder = editingFolderId === folder.id;

        return (
          <section key={folder.id} className="flex flex-col gap-px">
            <div
              className="group/folder flex min-h-12 items-center gap-1 rounded-xl px-2 text-xs text-muted-foreground transition-[background-color,color] hover:bg-muted/60"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                reorderDraggedConversation({
                  folderId: folder.id,
                  pinned: false,
                });
              }}
            >
              <FolderIcon className="size-3.5 shrink-0" aria-hidden="true" />
              {isEditingFolder ? (
                <div className="flex min-w-0 flex-1 items-center gap-1">
                  <Input
                    aria-label={t("folderName")}
                    value={editingFolderName}
                    onChange={(event) =>
                      setEditingFolderName(event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        const name = editingFolderName.trim();
                        if (name) {
                          onRenameConversationFolder?.(folder.id, name);
                          setEditingFolderId(null);
                        }
                      }
                      if (event.key === "Escape") setEditingFolderId(null);
                    }}
                    className="h-10 min-w-0 rounded-lg px-3 text-xs"
                    autoFocus
                  />
                </div>
              ) : (
                <button
                  type={BUTTON_TYPE}
                  className="flex min-h-10 min-w-0 flex-1 items-center gap-1 rounded-lg px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  aria-expanded={open}
                  onClick={() => setFolderOpen(folder.id, !open)}
                >
                  <ChevronDownIcon
                    className={cn(
                      "size-3 shrink-0 transition-transform",
                      !open && "-rotate-90",
                    )}
                    aria-hidden="true"
                  />
                  <span className="truncate font-medium">{folder.name}</span>
                  <span className="text-muted-foreground/50">
                    {folderConversations.length}
                  </span>
                </button>
              )}
              {!readOnly ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type={BUTTON_TYPE}
                      size="icon-sm"
                      variant={GHOST_VARIANT}
                      className="size-10 rounded-xl transition-[background-color,opacity] md:opacity-0 md:group-hover/folder:opacity-100 md:group-focus-within/folder:opacity-100 data-[state=open]:opacity-100"
                      aria-label={t("folderActions")}
                    >
                      <MoreHorizontalIcon
                        className="size-3"
                        aria-hidden="true"
                      />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => {
                        window.requestAnimationFrame(() => {
                          setEditingFolderId(folder.id);
                          setEditingFolderName(folder.name);
                        });
                      }}
                      className="min-h-10 gap-2"
                    >
                      <PencilIcon className="size-3.5" aria-hidden="true" />
                      {t("rename")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => onDeleteConversationFolder?.(folder.id)}
                      className="min-h-10 gap-2"
                    >
                      <Trash2Icon className="size-3.5" aria-hidden="true" />
                      {t("deleteFolder")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
            {open ? (
              <div className="flex flex-col gap-px pl-3">
                {folderConversations.length > 0 ? (
                  folderConversations.map((conversation) =>
                    renderConversation(conversation),
                  )
                ) : (
                  <div
                    className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground/60"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      reorderDraggedConversation({
                        folderId: folder.id,
                        pinned: false,
                      });
                    }}
                  >
                    {t("dropChatsHere")}
                  </div>
                )}
              </div>
            ) : null}
          </section>
        );
      })}

      <section
        className="flex flex-col gap-px"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          reorderDraggedConversation({
            folderId: null,
            pinned: false,
          });
        }}
      >
        {topLevelConversations.length > 0 ? (
          <>
            {topLevelConversations.map((conversation) =>
              renderConversation(conversation),
            )}
          </>
        ) : folderSections.length === 0 ? (
          <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground/60">
            {t("dropChatsHere")}
          </div>
        ) : null}
      </section>

      {hasMoreConversations && onLoadMoreConversations ? (
        <Button
          type={BUTTON_TYPE}
          variant={GHOST_VARIANT}
          size="sm"
          className="mt-2 min-h-10 rounded-xl text-xs text-muted-foreground"
          disabled={loadingMoreConversations}
          onClick={onLoadMoreConversations}
        >
          {loadingMoreConversations ? t("loading") : t("loadOlder")}
        </Button>
      ) : null}
    </div>
  );
}


export function ChatSidebarListsBranch2({
  model,
}: {
  model: ChatSidebarViewModel;
}) {
  const { t } = model;
  return (
    <div className="pt-2">
      <Empty className="border-0 bg-transparent px-2 py-10">
        <EmptyHeader>
          <EmptyMedia
            variant="icon"
            className="border-0 bg-transparent text-muted-foreground/40"
          >
            <MessageSquareIcon className="size-5" aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle className="text-sm font-medium">
            {t("emptyTitle")}
          </EmptyTitle>
          <EmptyDescription className="text-xs text-muted-foreground/60">
            {t("emptyDescription")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}


export function ChatSidebarListsBranch3({
  model,
}: {
  model: ChatSidebarViewModel;
}) {
  const {} = model;
  return (
    <div className="flex flex-col gap-px pt-px">
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
    </div>
  );
}


export function ChatSidebarListsBranch4({
  model,
}: {
  model: ChatSidebarViewModel;
}) {
  const {
    hasMoreSearchResults,
    loadingMoreSearchResults,
    onLoadMoreSearchResults,
    onRetrySearch,
    renderConversation,
    searchError,
    searchResults,
    t,
  } = model;
  return (
    <div className="flex flex-col gap-1">
      <div className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">
        {t("searchResultCount", { count: searchResults.length })}
      </div>
      {searchResults.map((conversation) =>
        renderConversation(conversation, { searchResult: true }),
      )}
      {searchError && onRetrySearch ? (
        <Button
          type={BUTTON_TYPE}
          variant="ghost"
          size="sm"
          className="min-h-10 rounded-xl text-xs text-muted-foreground"
          onClick={onRetrySearch}
        >
          <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
          {t("retrySearch")}
        </Button>
      ) : null}
      {hasMoreSearchResults && onLoadMoreSearchResults ? (
        <Button
          type={BUTTON_TYPE}
          variant={GHOST_VARIANT}
          size="sm"
          className="mt-1 min-h-10 rounded-xl text-xs text-muted-foreground"
          disabled={loadingMoreSearchResults}
          onClick={onLoadMoreSearchResults}
        >
          {loadingMoreSearchResults ? t("loading") : t("loadMoreResults")}
        </Button>
      ) : null}
    </div>
  );
}


export function ChatSidebarListsBranch5({
  model,
}: {
  model: ChatSidebarViewModel;
}) {
  const { searchQuery, t } = model;
  return (
    <Empty className="border-0 bg-transparent px-2 py-10">
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className="border-0 bg-transparent text-muted-foreground/40"
        >
          <SearchXIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle className="text-sm font-medium">
          {t("noSearchResultsTitle")}
        </EmptyTitle>
        <EmptyDescription className="text-xs text-muted-foreground/60">
          {t("noSearchResultsDescription", {
            query: searchQuery.trim(),
          })}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}


export function ChatSidebarListsBranch6({
  model,
}: {
  model: ChatSidebarViewModel;
}) {
  const { onRetrySearch, t } = model;
  return (
    <Empty className="border-0 bg-transparent px-2 py-10">
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className="border-0 bg-transparent text-muted-foreground/40"
        >
          <SearchXIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle className="text-sm font-medium">
          {t("searchErrorTitle")}
        </EmptyTitle>
        <EmptyDescription className="text-xs text-muted-foreground/60">
          {t("searchErrorDescription")}
        </EmptyDescription>
      </EmptyHeader>
      {onRetrySearch ? (
        <Button
          type={BUTTON_TYPE}
          variant="outline"
          size="sm"
          className="min-h-10 rounded-xl"
          onClick={onRetrySearch}
        >
          <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
          {t("retrySearch")}
        </Button>
      ) : null}
    </Empty>
  );
}


export function ChatSidebarListsBranch7({
  model,
}: {
  model: ChatSidebarViewModel;
}) {
  const {} = model;
  return (
    <div className="flex flex-col gap-px pt-px" aria-busy="true">
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
    </div>
  );
}


export function ChatSidebarListsBranch8({
  model,
}: {
  model: ChatSidebarViewModel;
}) {
  const { renderHistoryActions, t } = model;
  return (
    <div className="flex min-h-10 items-center justify-between gap-2 px-2">
      <span className="min-w-0 truncate font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
        {t("recent")}
      </span>
      {renderHistoryActions()}
    </div>
  );
}


export function ChatSidebarContentSection1({
  model,
}: {
  model: ChatSidebarViewModel;
}) {
  const {
    conversationFolders,
    conversations,
    loading,
    searchActive,
    searchError,
    searchResults,
    searching,
  } = model;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 pb-3 pt-1">
      {!searchActive ? <ChatSidebarListsBranch8 model={model} /> : null}
      <div className="flex min-h-0 flex-col gap-1">
        {searchActive ? (
          searching && searchResults.length === 0 ? (
            <ChatSidebarListsBranch7 model={model} />
          ) : searchError && searchResults.length === 0 ? (
            <ChatSidebarListsBranch6 model={model} />
          ) : searchResults.length === 0 ? (
            <ChatSidebarListsBranch5 model={model} />
          ) : (
            <ChatSidebarListsBranch4 model={model} />
          )
        ) : loading ? (
          <ChatSidebarListsBranch3 model={model} />
        ) : conversations.length === 0 && conversationFolders.length === 0 ? (
          <ChatSidebarListsBranch2 model={model} />
        ) : (
          <ChatSidebarListsBranch1 model={model} />
        )}
      </div>
    </div>
  );
}


export function ChatSidebarContentSection2({
  model,
}: {
  model: ChatSidebarViewModel;
}) {
  const {
    creatingFolder,
    newFolderName,
    onNewConversation,
    onNewTemporaryConversation,
    onSearchQueryChange,
    readOnly,
    saveNewFolder,
    searchActive,
    searchError,
    searchQuery,
    searchResults,
    searching,
    setCreatingFolder,
    setNewFolderName,
    t,
  } = model;
  const searchPlaceholder = readOnly
    ? t("searchCompactPlaceholder")
    : t("searchPlaceholder");
  return (
    <div className="@container flex shrink-0 flex-col gap-2 px-3 pb-2 pt-3">
      <div className="flex items-center gap-2">
        {onNewTemporaryConversation ? (
          <TemporaryConversationButton onSelect={onNewTemporaryConversation} />
        ) : null}
        <Button
          type={BUTTON_TYPE}
          onClick={onNewConversation}
          className="h-11 min-w-0 flex-1 justify-center gap-2 rounded-xl px-2.5 text-sm shadow-[0_8px_22px_-16px_color-mix(in_oklch,var(--primary)_70%,transparent)] @[16rem]:justify-start @[16rem]:gap-2.5 @[16rem]:px-3.5"
          aria-label={t("newConversation")}
        >
          <MessageSquarePlusIcon
            className="size-4 shrink-0"
            aria-hidden="true"
          />
          <span className="min-w-0 truncate @[16rem]:hidden">{t("new")}</span>
          <span className="hidden min-w-0 truncate @[16rem]:inline">
            {t("newConversation")}
          </span>
        </Button>
      </div>

      <div className="relative flex items-center">
        <SearchIcon
          className="pointer-events-none absolute left-3 z-10 size-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          name="conversation-search"
          autoComplete="off"
          aria-label={t("searchLabel")}
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={(event) => onSearchQueryChange?.(event.target.value)}
          className={cn(
            "peer h-11 min-w-0 rounded-xl border-sidebar-border/60 bg-card/60 pl-9 text-xs shadow-none placeholder:truncate placeholder:opacity-0",
            searchActive ? "pr-11" : "pr-3",
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-1/2 left-9 z-10 -translate-y-1/2 truncate text-xs text-muted-foreground/80 opacity-0 peer-placeholder-shown:opacity-100",
            searchActive ? "right-11" : "right-3",
            readOnly ? null : "@[15rem]:hidden",
          )}
        >
          {t("searchCompactPlaceholder")}
        </span>
        {readOnly ? null : (
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute top-1/2 left-9 z-10 hidden -translate-y-1/2 truncate text-xs text-muted-foreground/80 opacity-0 peer-placeholder-shown:opacity-100 @[15rem]:block",
              searchActive ? "right-11" : "right-3",
            )}
          >
            {t("searchPlaceholder")}
          </span>
        )}
        {searchActive ? (
          <Button
            type={BUTTON_TYPE}
            size="icon-sm"
            variant={GHOST_VARIANT}
            className="absolute right-0.5 z-10 size-10 shrink-0 rounded-[10px]"
            aria-label={t("clearSearch")}
            onClick={() => onSearchQueryChange?.("")}
          >
            <XIcon data-icon="inline-start" aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      <p className="sr-only" aria-live="polite">
        {searchActive && !searching && !searchError
          ? t("searchResultCount", { count: searchResults.length })
          : null}
      </p>

      {!readOnly && creatingFolder ? (
        <div className="flex items-center gap-1 rounded-xl border border-sidebar-border/60 bg-background p-1">
          <Input
            aria-label={t("folderName")}
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveNewFolder();
              if (event.key === "Escape") setCreatingFolder(false);
            }}
            placeholder={t("folderName")}
            className="h-10 min-w-0 rounded-lg px-3 text-xs"
            autoFocus
          />
          <Button
            type={BUTTON_TYPE}
            size="icon-sm"
            variant={GHOST_VARIANT}
            aria-label={t("createFolder")}
            className="size-10 shrink-0 rounded-xl"
            onClick={saveNewFolder}
          >
            <CheckIcon className="size-3" aria-hidden="true" />
          </Button>
          <Button
            type={BUTTON_TYPE}
            size="icon-sm"
            variant={GHOST_VARIANT}
            aria-label={t("cancelFolderCreation")}
            className="size-10 shrink-0 rounded-xl"
            onClick={() => setCreatingFolder(false)}
          >
            <XIcon className="size-3" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}


export function ChatSidebarBodySection1({
  model,
}: {
  model: ChatSidebarViewModel;
}) {
  const { navGroups, showWorkspaceNavigation } = model;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatSidebarContentSection2 model={model} />

      <ChatSidebarContentSection1 model={model} />

      {showWorkspaceNavigation && navGroups.length > 0 ? (
        <ChatAppNavigation groups={navGroups} />
      ) : null}
    </div>
  );
}


export function ChatSidebarSection1({
  model,
}: {
  model: ChatSidebarViewModel;
}) {
  const {} = model;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatSidebarBodySection1 model={model} />
    </div>
  );
}

