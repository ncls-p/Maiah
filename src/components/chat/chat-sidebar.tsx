"use client";

import { Link, usePathname } from "@/i18n/navigation";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  CheckIcon,
  FolderIcon,
  FolderPlusIcon,
  MoreHorizontalIcon,
  MessageSquareIcon,
  PanelLeftOpenIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SearchXIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useMemo, useState, useSyncExternalStore, ViewTransition } from "react";
import { useLocale, useTranslations } from "next-intl";

import type {
  ChatAgent,
  ChatConversation,
  ChatConversationFolder,
} from "@/components/chat/chat-types";
import {
  SidebarFooter,
  SidebarHeader,
  SidebarNavIcon,
  sidebarNavItemClassName,
} from "@/components/sidebar-chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  isNavItemActive,
  type NavGroup,
  type NavItem,
  type WorkspaceShellState,
} from "@/lib/workspace-nav";
import { buildMenuGroups } from "@/modules/navigation/sidebar-config";
import { cn } from "@/lib/utils";

const WORKSPACE_NAV_OPEN_STORAGE_KEY = "chat-workspace-navigation-open";
const WORKSPACE_NAV_OPEN_STORAGE_EVENT =
  "chat-workspace-navigation-open-change";
const DEFAULT_WORKSPACE_NAV_OPEN = false;
const BUTTON_TYPE = "button";
const GHOST_VARIANT = "ghost";

function subscribeWorkspaceNavOpen(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(WORKSPACE_NAV_OPEN_STORAGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(WORKSPACE_NAV_OPEN_STORAGE_EVENT, callback);
  };
}

function getStoredWorkspaceNavOpen() {
  const stored = window.localStorage.getItem(WORKSPACE_NAV_OPEN_STORAGE_KEY);
  if (stored === null) return DEFAULT_WORKSPACE_NAV_OPEN;
  return stored === "true";
}

function setStoredWorkspaceNavOpen(isOpen: boolean) {
  window.localStorage.setItem(WORKSPACE_NAV_OPEN_STORAGE_KEY, String(isOpen));
  window.dispatchEvent(new Event(WORKSPACE_NAV_OPEN_STORAGE_EVENT));
}

interface ChatSidebarProps {
  agents: ChatAgent[];
  conversations: ChatConversation[];
  conversationFolders: ChatConversationFolder[];
  activeConversationId: string | null;
  loading?: boolean;
  searchQuery?: string;
  searchResults?: ChatConversation[];
  searching?: boolean;
  searchError?: boolean;
  hasMoreSearchResults?: boolean;
  loadingMoreSearchResults?: boolean;
  onSearchQueryChange?: (query: string) => void;
  onRetrySearch?: () => void;
  onLoadMoreSearchResults?: () => void;
  onSelectConversation: (
    conversationId: string,
    conversationAgentId?: string | null,
  ) => void;
  onNewConversation: () => void;
  canCreateAgent?: boolean;
  onRenameConversation?: (conversationId: string, title: string) => void;
  onDeleteConversation?: (conversationId: string) => void;
  onCreateConversationFolder?: (name: string) => void;
  onRenameConversationFolder?: (folderId: string, name: string) => void;
  onDeleteConversationFolder?: (folderId: string) => void;
  onToggleConversationPin?: (conversationId: string, pinned: boolean) => void;
  onReorderConversations?: (input: {
    conversationIds: string[];
    folderId: string | null;
    pinned?: boolean;
  }) => void;
  hasMoreConversations?: boolean;
  loadingMoreConversations?: boolean;
  onLoadMoreConversations?: () => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  className?: string;
  shell?: WorkspaceShellState;
}

function formatRelativeTime(
  dateStr: string,
  locale: string,
  t: ReturnType<typeof useTranslations<"chat.sidebar">>,
): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t("justNow");
  if (diffMins < 60) return t("minutesAgo", { count: diffMins });
  if (diffHours < 24) return t("hoursAgo", { count: diffHours });
  if (diffDays < 7) return t("daysAgo", { count: diffDays });
  return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function ChatNavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const Icon = item.icon;
  const label = t(item.labelKey);
  const active = isNavItemActive(pathname, item.href);

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={sidebarNavItemClassName({ active })}
    >
      <SidebarNavIcon active={active}>
        <Icon className="size-4 shrink-0" aria-hidden="true" />
      </SidebarNavIcon>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {item.badge && item.badge > 0 ? (
        <Badge variant="secondary" className="h-5 min-w-5 px-1 text-[10px]">
          {item.badge}
        </Badge>
      ) : null}
    </Link>
  );
}

function ChatAppNavigation({ groups }: { groups: NavGroup[] }) {
  const tGroups = useTranslations("nav.groups");
  const t = useTranslations("chat.sidebar");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const workspaceOpen = useSyncExternalStore(
    subscribeWorkspaceNavOpen,
    getStoredWorkspaceNavOpen,
    () => DEFAULT_WORKSPACE_NAV_OPEN,
  );
  const primaryItems = groups
    .filter((group) => group.labelKey !== "advanced")
    .flatMap((group) => group.items)
    .filter((item) => item.href !== "/chat")
    .slice(0, 6);
  const advancedItems = groups
    .find((group) => group.labelKey === "advanced")
    ?.items.filter((item) => item.href !== "/chat");

  if (
    primaryItems.length === 0 &&
    (!advancedItems || advancedItems.length === 0)
  ) {
    return null;
  }

  return (
    <Collapsible
      open={workspaceOpen}
      onOpenChange={setStoredWorkspaceNavOpen}
      className="border-t border-sidebar-border/60 px-2 py-2"
    >
      <CollapsibleTrigger asChild>
        <button
          type={BUTTON_TYPE}
          className="flex min-h-10 w-full items-center justify-between rounded-xl px-3 text-xs font-medium text-muted-foreground transition-[background-color,color] hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
        >
          <span>{t("workspace")}</span>
          <ChevronDownIcon
            className={cn(
              "size-3.5 transition-transform",
              workspaceOpen && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1">
        <div className="flex flex-col gap-1">
          {primaryItems.map((item) => (
            <ChatNavLink key={item.href} item={item} />
          ))}
        </div>
        {advancedItems && advancedItems.length > 0 ? (
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <button
                type={BUTTON_TYPE}
                className="mt-1 flex min-h-10 w-full items-center justify-between rounded-xl px-3 text-[13px] font-medium text-sidebar-foreground/75 transition-[background-color,color] hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
              >
                <span>{tGroups("advanced")}</span>
                <ChevronDownIcon
                  className={cn(
                    "size-3.5 transition-transform",
                    advancedOpen && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1 flex flex-col gap-1">
              {advancedItems.map((item) => (
                <ChatNavLink key={item.href} item={item} />
              ))}
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ConversationItem({
  conversation,
  isActive,
  isEditing,
  editingTitle,
  agentName,
  onSelect,
  onRename,
  onDelete,
  onEditStart,
  onEditChange,
  onEditCancel,
  onTogglePin,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onDragStart,
  onDragEnd,
  onDropBefore,
  isDragging,
  searchMatch,
}: {
  conversation: ChatConversation;
  isActive: boolean;
  isEditing: boolean;
  editingTitle: string;
  agentName: string;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  onEditStart: () => void;
  onEditChange: (title: string) => void;
  onEditCancel: () => void;
  onTogglePin: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDropBefore: (event: React.DragEvent<HTMLDivElement>) => void;
  isDragging: boolean;
  searchMatch?: ChatConversation["searchMatch"];
}) {
  const locale = useLocale();
  const t = useTranslations("chat.sidebar");
  const pinned = Boolean(conversation.pinnedAt);

  return (
    <div
      draggable={!isEditing && !searchMatch}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDropBefore}
      className={cn(
        "group/conversation relative overflow-hidden rounded-xl transition-[background-color,opacity]",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "hover:bg-muted/70",
        isDragging && "opacity-45",
      )}
    >
      {isEditing ? (
        <div className="flex min-w-0 flex-1 items-center gap-1 p-1.5">
          <Input
            aria-label={t("conversationTitle")}
            value={editingTitle}
            onChange={(event) => onEditChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                const nextTitle = editingTitle.trim();
                if (nextTitle) {
                  onRename(nextTitle);
                }
              }
              if (event.key === "Escape") {
                onEditCancel();
              }
            }}
            className="h-10 min-w-0 rounded-xl px-3 text-xs"
            autoFocus
          />
          <Button
            type={BUTTON_TYPE}
            size="icon-sm"
            variant={GHOST_VARIANT}
            aria-label={t("saveTitle")}
            className="size-10 shrink-0 rounded-xl"
            onClick={() => {
              const nextTitle = editingTitle.trim();
              if (!nextTitle) return;
              onRename(nextTitle);
            }}
          >
            <CheckIcon className="size-3" aria-hidden="true" />
          </Button>
          <Button
            type={BUTTON_TYPE}
            size="icon-sm"
            variant={GHOST_VARIANT}
            aria-label={t("cancelTitleEdit")}
            className="size-10 shrink-0 rounded-xl"
            onClick={onEditCancel}
          >
            <XIcon className="size-3" aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <div className="flex min-h-12 items-center gap-0.5 px-2 py-1">
          <button
            type={BUTTON_TYPE}
            onClick={onSelect}
            className="min-h-10 min-w-0 flex-1 rounded-lg px-1.5 text-left outline-none transition-[color] focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <span
              className={cn(
                "block truncate text-[13px] leading-tight transition-[color]",
                isActive ? "font-semibold text-foreground" : "font-medium",
              )}
            >
              {conversation.title}
            </span>
            {searchMatch ? (
              <span className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                <span className="font-medium">
                  {searchMatch.kind === "message"
                    ? t("messageMatch")
                    : t("titleMatch")}
                </span>
                {searchMatch.kind === "message"
                  ? ` · “${searchMatch.snippet}”`
                  : null}
              </span>
            ) : null}
            <span className="mt-1 flex items-center gap-1 text-[11px] leading-none text-muted-foreground/75">
              <span className="truncate">{agentName}</span>
              <span className="shrink-0 text-muted-foreground/25">·</span>
              <span className="shrink-0">
                {formatRelativeTime(conversation.updatedAt, locale, t)}
              </span>
            </span>
          </button>
          {pinned && !searchMatch ? (
            <PinIcon
              className="size-3 shrink-0 text-primary"
              aria-hidden="true"
            />
          ) : null}
          {!searchMatch ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type={BUTTON_TYPE}
                  size="icon-sm"
                  variant={GHOST_VARIANT}
                  aria-label={t("conversationActions")}
                  className={cn(
                    "size-10 shrink-0 rounded-xl transition-[background-color,opacity] hover:bg-background/80 md:opacity-0 md:group-hover/conversation:opacity-100 md:group-focus-within/conversation:opacity-100 data-[state=open]:opacity-100",
                    isActive && "opacity-100",
                  )}
                >
                  <MoreHorizontalIcon className="size-3" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onSelect={onTogglePin}
                    className="min-h-10 gap-2"
                  >
                    <PinIcon className="size-3.5" aria-hidden="true" />
                    {pinned ? t("unpin") : t("pinToTop")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={onMoveUp}
                    disabled={!canMoveUp}
                    className="min-h-10 gap-2"
                  >
                    <ArrowUpIcon className="size-3.5" aria-hidden="true" />
                    {t("moveUp")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={onMoveDown}
                    disabled={!canMoveDown}
                    className="min-h-10 gap-2"
                  >
                    <ArrowDownIcon className="size-3.5" aria-hidden="true" />
                    {t("moveDown")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={onEditStart}
                    className="min-h-10 gap-2"
                  >
                    <PencilIcon className="size-3.5" aria-hidden="true" />
                    {t("rename")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={onDelete}
                    className="min-h-10 gap-2"
                  >
                    <Trash2Icon className="size-3.5" aria-hidden="true" />
                    {t("delete")}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function ChatSidebar({
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
  canCreateAgent = false,
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
  const [closedFolderIds, setClosedFolderIds] = useState<Set<string>>(
    () => new Set(),
  );
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
  const canConfigureProviders = Boolean(shell?.permissions.canManageProviders);
  const searchActive = searchQuery.trim().length > 0;
  const sortedConversations = useMemo(() => {
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
  }, [conversations]);
  const pinnedConversations = useMemo(
    () => sortedConversations.filter((conversation) => conversation.pinnedAt),
    [sortedConversations],
  );
  const unpinnedConversations = useMemo(
    () => sortedConversations.filter((conversation) => !conversation.pinnedAt),
    [sortedConversations],
  );
  const topLevelConversations = useMemo(
    () =>
      unpinnedConversations.filter((conversation) => !conversation.folderId),
    [unpinnedConversations],
  );
  const folderSections = useMemo(() => {
    return conversationFolders.map((folder) => ({
      folder,
      conversations: unpinnedConversations.filter(
        (conversation) => conversation.folderId === folder.id,
      ),
    }));
  }, [conversationFolders, unpinnedConversations]);

  function orderedIdsWithInsertion(
    items: ChatConversation[],
    draggedId: string,
    beforeId?: string,
  ) {
    const ids = items
      .map((conversation) => conversation.id)
      .filter((id) => id !== draggedId);
    const insertionIndex = beforeId ? ids.indexOf(beforeId) : -1;
    ids.splice(insertionIndex >= 0 ? insertionIndex : ids.length, 0, draggedId);
    return ids;
  }

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

  function conversationGroup(conversation: ChatConversation) {
    const pinned = Boolean(conversation.pinnedAt);
    const folderId = pinned ? null : (conversation.folderId ?? null);
    const items = pinned
      ? pinnedConversations
      : folderId
        ? (folderSections.find((section) => section.folder.id === folderId)
            ?.conversations ?? [])
        : topLevelConversations;
    return { folderId, pinned, items };
  }

  function canMoveConversation(conversation: ChatConversation, delta: -1 | 1) {
    if (!onReorderConversations) return false;
    const { items } = conversationGroup(conversation);
    const currentIndex = items.findIndex((item) => item.id === conversation.id);
    const nextIndex = currentIndex + delta;
    return currentIndex >= 0 && nextIndex >= 0 && nextIndex < items.length;
  }

  function moveConversation(conversation: ChatConversation, delta: -1 | 1) {
    if (!onReorderConversations) return;
    const { folderId, pinned, items } = conversationGroup(conversation);
    const currentIndex = items.findIndex((item) => item.id === conversation.id);
    const nextIndex = currentIndex + delta;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= items.length) return;

    const conversationIds = items.map((item) => item.id);
    const [conversationId] = conversationIds.splice(currentIndex, 1);
    if (!conversationId) return;
    conversationIds.splice(nextIndex, 0, conversationId);
    onReorderConversations({ conversationIds, folderId, pinned });
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

  function toggleFolder(folderId: string) {
    setClosedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  function renderConversation(
    conversation: ChatConversation,
    options?: { searchResult?: boolean },
  ) {
    const isActive = activeConversationId === conversation.id;
    const isEditing = editingConversationId === conversation.id;
    const agentName = agentNameById.get(conversation.agentId) ?? t("assistant");

    return (
      <ConversationItem
        key={conversation.id}
        conversation={conversation}
        isActive={isActive}
        isEditing={isEditing}
        editingTitle={isEditing ? editingTitle : ""}
        agentName={agentName}
        onSelect={() =>
          onSelectConversation(conversation.id, conversation.agentId)
        }
        onRename={(title) => {
          onRenameConversation?.(conversation.id, title);
          setEditingConversationId(null);
        }}
        onDelete={() => onDeleteConversation?.(conversation.id)}
        onEditStart={() => {
          setEditingConversationId(conversation.id);
          setEditingTitle(conversation.title);
        }}
        onEditChange={setEditingTitle}
        onEditCancel={() => setEditingConversationId(null)}
        onTogglePin={() =>
          onToggleConversationPin?.(conversation.id, !conversation.pinnedAt)
        }
        onMoveUp={() => moveConversation(conversation, -1)}
        onMoveDown={() => moveConversation(conversation, 1)}
        canMoveUp={canMoveConversation(conversation, -1)}
        canMoveDown={canMoveConversation(conversation, 1)}
        onDragStart={(event) => {
          setDraggingConversationId(conversation.id);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", conversation.id);
        }}
        onDragEnd={() => setDraggingConversationId(null)}
        onDropBefore={(event) => handleConversationDrop(event, conversation)}
        isDragging={draggingConversationId === conversation.id}
        searchMatch={
          options?.searchResult ? conversation.searchMatch : undefined
        }
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
                    activeConversationId === conversation.id
                      ? "secondary"
                      : "ghost"
                  }
                  aria-label={conversation.title}
                  onClick={() => onSelectConversation(conversation.id)}
                  className={cn(
                    "size-10 rounded-xl transition-[background-color,color]",
                    activeConversationId === conversation.id &&
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
          <Button
            type={BUTTON_TYPE}
            size="sm"
            variant="outline"
            onClick={onNewConversation}
            className="min-h-10 gap-1 rounded-xl px-3 text-xs font-medium"
          >
            <PlusIcon className="size-3.5" aria-hidden="true" />
            {t("new")}
          </Button>
        }
      />

      <ViewTransition
        name="app-sidebar-content"
        share="auto"
        enter="auto"
        default="none"
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2 py-2">
            <div className="flex min-h-10 items-center justify-between px-2">
              <span className="text-[11px] font-medium text-muted-foreground">
                {t("conversations")}
              </span>
              <div className="flex items-center">
                <Button
                  type={BUTTON_TYPE}
                  size="icon-sm"
                  variant={GHOST_VARIANT}
                  aria-label={t("createFolder")}
                  className="size-10 rounded-xl text-muted-foreground"
                  onClick={startFolderCreate}
                >
                  <FolderPlusIcon className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 px-1 pb-1">
              <SearchIcon
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                name="conversation-search"
                autoComplete="off"
                aria-label={t("searchLabel")}
                placeholder={t("searchPlaceholder")}
                value={searchQuery}
                onChange={(event) => onSearchQueryChange?.(event.target.value)}
                className="h-10 min-w-0 rounded-xl px-3 text-xs"
              />
              {searchActive ? (
                <Button
                  type={BUTTON_TYPE}
                  size="icon-sm"
                  variant={GHOST_VARIANT}
                  className="size-10 shrink-0 rounded-xl"
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

            {creatingFolder ? (
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

            <div className="flex min-h-0 flex-col gap-1">
              {searchActive ? (
                searching && searchResults.length === 0 ? (
                  <div className="flex flex-col gap-px pt-px" aria-busy="true">
                    <Skeleton className="h-16 w-full rounded-xl" />
                    <Skeleton className="h-16 w-full rounded-xl" />
                    <Skeleton className="h-16 w-full rounded-xl" />
                  </div>
                ) : searchError && searchResults.length === 0 ? (
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
                        <RefreshCwIcon
                          data-icon="inline-start"
                          aria-hidden="true"
                        />
                        {t("retrySearch")}
                      </Button>
                    ) : null}
                  </Empty>
                ) : searchResults.length === 0 ? (
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
                ) : (
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
                        <RefreshCwIcon
                          data-icon="inline-start"
                          aria-hidden="true"
                        />
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
                        {loadingMoreSearchResults
                          ? t("loading")
                          : t("loadMoreResults")}
                      </Button>
                    ) : null}
                  </div>
                )
              ) : loading ? (
                <div className="flex flex-col gap-px pt-px">
                  <Skeleton className="h-12 w-full rounded-xl" />
                  <Skeleton className="h-12 w-full rounded-xl" />
                  <Skeleton className="h-12 w-full rounded-xl" />
                </div>
              ) : conversations.length === 0 &&
                conversationFolders.length === 0 ? (
                <div className="pt-2">
                  <Empty className="border-0 bg-transparent px-2 py-10">
                    <EmptyHeader>
                      <EmptyMedia
                        variant="icon"
                        className="border-0 bg-transparent text-muted-foreground/40"
                      >
                        <MessageSquareIcon
                          className="size-5"
                          aria-hidden="true"
                        />
                      </EmptyMedia>
                      <EmptyTitle className="text-sm font-medium">
                        {t("emptyTitle")}
                      </EmptyTitle>
                      <EmptyDescription className="text-xs text-muted-foreground/60">
                        {t("emptyDescription")}
                      </EmptyDescription>
                    </EmptyHeader>
                    {canConfigureProviders || canCreateAgent ? (
                      <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
                        {canConfigureProviders ? (
                          <Button
                            asChild
                            variant="link"
                            size="sm"
                            className="min-h-10 px-0 text-muted-foreground"
                          >
                            <Link href="/providers">
                              {t("configureProvider")}
                            </Link>
                          </Button>
                        ) : null}
                        {canCreateAgent ? (
                          <Button
                            asChild
                            variant="link"
                            size="sm"
                            className="min-h-10 px-0 text-muted-foreground"
                          >
                            <Link href="/agents">{t("createAgent")}</Link>
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </Empty>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
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

                  {folderSections.map(
                    ({ folder, conversations: folderConversations }) => {
                      const open = !closedFolderIds.has(folder.id);
                      const isEditingFolder = editingFolderId === folder.id;

                      return (
                        <section
                          key={folder.id}
                          className="flex flex-col gap-px"
                        >
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
                            <FolderIcon
                              className="size-3.5 shrink-0"
                              aria-hidden="true"
                            />
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
                                        onRenameConversationFolder?.(
                                          folder.id,
                                          name,
                                        );
                                        setEditingFolderId(null);
                                      }
                                    }
                                    if (event.key === "Escape")
                                      setEditingFolderId(null);
                                  }}
                                  className="h-10 min-w-0 rounded-lg px-3 text-xs"
                                  autoFocus
                                />
                              </div>
                            ) : (
                              <button
                                type={BUTTON_TYPE}
                                className="flex min-h-10 min-w-0 flex-1 items-center gap-1 rounded-lg px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                                onClick={() => toggleFolder(folder.id)}
                              >
                                <ChevronDownIcon
                                  className={cn(
                                    "size-3 shrink-0 transition-transform",
                                    !open && "-rotate-90",
                                  )}
                                  aria-hidden="true"
                                />
                                <span className="truncate font-medium">
                                  {folder.name}
                                </span>
                                <span className="text-muted-foreground/50">
                                  {folderConversations.length}
                                </span>
                              </button>
                            )}
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
                                    setEditingFolderId(folder.id);
                                    setEditingFolderName(folder.name);
                                  }}
                                  className="min-h-10 gap-2"
                                >
                                  <PencilIcon
                                    className="size-3.5"
                                    aria-hidden="true"
                                  />
                                  {t("rename")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  variant="destructive"
                                  onSelect={() =>
                                    onDeleteConversationFolder?.(folder.id)
                                  }
                                  className="min-h-10 gap-2"
                                >
                                  <Trash2Icon
                                    className="size-3.5"
                                    aria-hidden="true"
                                  />
                                  {t("deleteFolder")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
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
                    },
                  )}

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
                        <div className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">
                          {t("recent")}
                        </div>
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
              )}
            </div>
          </div>

          {navGroups.length > 0 ? (
            <ChatAppNavigation groups={navGroups} />
          ) : null}
        </div>
      </ViewTransition>
      <SidebarFooter displayName={shell?.displayName} />
    </div>
  );
}
