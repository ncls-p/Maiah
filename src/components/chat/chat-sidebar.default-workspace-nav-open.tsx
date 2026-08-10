"use client";

import { Link,usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode } from "react";

import type { ChatAgent,ChatConversation,ChatConversationFolder } from "@/components/chat/chat-types";
import { SidebarNavIcon,sidebarNavItemClassName } from "@/components/sidebar-chrome";
import { Badge } from "@/components/ui/badge";
import { isNavItemActive,type NavItem,type WorkspaceShellState } from "@/lib/workspace-nav";

const WORKSPACE_NAV_OPEN_STORAGE_KEY = "chat-workspace-navigation-open";
const WORKSPACE_NAV_OPEN_STORAGE_EVENT = "chat-workspace-navigation-open-change";
export const DEFAULT_WORKSPACE_NAV_OPEN = false;
export const BUTTON_TYPE = "button";
export const GHOST_VARIANT = "ghost";

export function subscribeWorkspaceNavOpen(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(WORKSPACE_NAV_OPEN_STORAGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(WORKSPACE_NAV_OPEN_STORAGE_EVENT, callback);
  };
}

export function getStoredWorkspaceNavOpen() {
  const stored = window.localStorage.getItem(WORKSPACE_NAV_OPEN_STORAGE_KEY);
  if (stored === null) return DEFAULT_WORKSPACE_NAV_OPEN;
  return stored === "true";
}

export function setStoredWorkspaceNavOpen(isOpen: boolean) {
  window.localStorage.setItem(WORKSPACE_NAV_OPEN_STORAGE_KEY, String(isOpen));
  window.dispatchEvent(new Event(WORKSPACE_NAV_OPEN_STORAGE_EVENT));
}

export interface ChatSidebarProps {
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
  onSelectConversation: (conversationId: string, conversationAgentId?: string | null) => void;
  onNewConversation: () => void;
  onNewTemporaryConversation?: (ttlMinutes: number) => void;
  onRenameConversation?: (conversationId: string, title: string) => void;
  onDeleteConversation?: (conversationId: string) => void;
  onCreateConversationFolder?: (name: string) => void;
  onRenameConversationFolder?: (folderId: string, name: string) => void;
  onDeleteConversationFolder?: (folderId: string) => void;
  onToggleConversationPin?: (conversationId: string, pinned: boolean) => void;
  onReorderConversations?: (input: { conversationIds: string[]; folderId: string | null; pinned?: boolean }) => void;
  hasMoreConversations?: boolean;
  loadingMoreConversations?: boolean;
  onLoadMoreConversations?: () => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  className?: string;
  shell?: WorkspaceShellState;
  workspaceId?: string | null;
  readOnly?: boolean;
  showWorkspaceNavigation?: boolean;
  footerContent?: ReactNode;
}

export function formatRelativeTime(dateStr: string, locale: string, t: ReturnType<typeof useTranslations<"chat.sidebar">>): string {
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

export function ChatNavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const Icon = item.icon;
  const label = t(item.labelKey);
  const active = isNavItemActive(pathname, item.href);

  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} className={sidebarNavItemClassName({ active })}>
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
