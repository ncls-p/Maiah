"use client";

import { Link } from "@/i18n/navigation";
import { ChevronDownIcon,CircleDollarSignIcon,MessageSquarePlusIcon,SearchIcon,Settings2Icon,StarIcon,ZapIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState,useSyncExternalStore } from "react";

import { useWorkspaceShell } from "@/components/app-shell";
import { ChatToolsMenu } from "@/components/chat/chat-tools-menu";
import type { ChatAgent } from "@/components/chat/chat-types";
import { ModelLogo } from "@/components/providers/model-logo";
import { WorkspaceStatusFooter } from "@/components/sidebar-chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuLabel,DropdownMenuSeparator,DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip,TooltipContent,TooltipProvider,TooltipTrigger } from "@/components/ui/tooltip";
import { useWorkspace } from "@/hooks/use-workspace";
import { DEFAULT_APP_SIDEBAR_OPEN,DEFAULT_APP_SIDEBAR_WIDTH,getStoredAppSidebarOpen,getStoredAppSidebarWidth,setStoredAppSidebarOpen,setStoredAppSidebarWidth,subscribeAppSidebarOpen,subscribeAppSidebarWidth } from "@/lib/sidebar-layout";
import { ChatLayoutProps,ChatSidebarCollapsedChangeHandler } from "./chat-layout.chat-composer-controls-context";
import { ChatLayoutView } from "./chat-layout.chat-layout.view";

export function useChatLayoutController({ agents, conversations, conversationFolders, selectedAgent, selectedAgentId, activeConversationId, conversationImpact, organizationDefaultAgentId, userDefaultAgentId, canChat, canCreateAgent = false, canRunSetup = false, loadingSidebar, conversationSearchQuery, conversationSearchResults, searchingConversations, conversationSearchError, hasMoreConversationSearchResults, loadingMoreConversationSearchResults, onConversationSearchQueryChange, onRetryConversationSearch, onLoadMoreConversationSearchResults, onSelectAgent, onSelectConversation, onNewConversation, onSetUserDefaultAgent, onRenameConversation, onDeleteConversation, onCreateConversationFolder, onRenameConversationFolder, onDeleteConversationFolder, onToggleConversationPin, onReorderConversations, hasMoreConversations, loadingMoreConversations, onLoadMoreConversations, onSetupComplete, children }: ChatLayoutProps) {
  const t = useTranslations("chat");
  const shell = useWorkspaceShell();
  const { workspaceId, workspaces } = useWorkspace();
  const activeWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);
  const [setupOpen, setSetupOpen] = useState(false);
  const [agentSearch, setAgentSearch] = useState("");
  const sidebarOpen = useSyncExternalStore(subscribeAppSidebarOpen, getStoredAppSidebarOpen, () => DEFAULT_APP_SIDEBAR_OPEN);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [resizingSidebar, setResizingSidebar] = useState(false);
  const sidebarWidth = useSyncExternalStore(subscribeAppSidebarWidth, getStoredAppSidebarWidth, () => DEFAULT_APP_SIDEBAR_WIDTH);

  function updateSidebarOpen({ open }: { open: boolean }) {
    setStoredAppSidebarOpen(open);
  }

  function startSidebarResize(event: React.PointerEvent<HTMLDivElement>) {
    if (!sidebarOpen) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    setResizingSidebar(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onPointerMove(moveEvent: PointerEvent) {
      setStoredAppSidebarWidth(startWidth + moveEvent.clientX - startX);
    }

    function onPointerUp() {
      setResizingSidebar(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    }

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp, { once: true });
  }

  function adjustSidebarWidth(delta: number) {
    setStoredAppSidebarWidth(sidebarWidth + delta);
  }

  const sidebarProps = {
    agents,
    conversations,
    conversationFolders,
    activeConversationId,
    loading: loadingSidebar,
    searchQuery: conversationSearchQuery,
    searchResults: conversationSearchResults,
    searching: searchingConversations,
    searchError: conversationSearchError,
    hasMoreSearchResults: hasMoreConversationSearchResults,
    loadingMoreSearchResults: loadingMoreConversationSearchResults,
    onSearchQueryChange: onConversationSearchQueryChange,
    onRetrySearch: onRetryConversationSearch,
    onLoadMoreSearchResults: onLoadMoreConversationSearchResults,
    onSelectConversation,
    onNewConversation,
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
    collapsed: false,
    onCollapsedChange: undefined,
    shell,
    workspaceId,
    showWorkspaceNavigation: false,
    footerContent: <WorkspaceStatusFooter name={activeWorkspace?.name ?? "Maiah"} context={activeWorkspace?.organizationName} />,
  };
  const handleDesktopSidebarCollapsedChange = ((collapsed) => {
    updateSidebarOpen({ open: !collapsed });
  }) satisfies ChatSidebarCollapsedChangeHandler;
  const desktopSidebarProps = {
    ...sidebarProps,
    onCollapsedChange: handleDesktopSidebarCollapsedChange,
  };
  const mobileSidebarProps = {
    ...sidebarProps,
    onSelectConversation: (conversationId: string, conversationAgentId?: string | null) => {
      onSelectConversation(conversationId, conversationAgentId);
      setMobileSidebarOpen(false);
    },
  };

  const selectedAgentLabel = selectedAgent?.name ?? t("chooseAssistant");
  const normalizedAgentSearch = agentSearch.trim().toLowerCase();
  const visibleAgents = normalizedAgentSearch ? agents.filter((agent) => agent.name.toLowerCase().includes(normalizedAgentSearch) || (agent.description ?? "").toLowerCase().includes(normalizedAgentSearch)) : agents;
  const organizationAgents = visibleAgents.filter((agent) => agent.isGlobal || agent.isRecommended || agent.canEdit === false);
  const personalAgents = visibleAgents.filter((agent) => agent.isGlobal !== true && agent.isRecommended !== true && agent.canEdit !== false);
  const defaultLabelForAgent = (agent: ChatAgent) => {
    if (agent.id === userDefaultAgentId) return t("myDefault");
    if (agent.id === organizationDefaultAgentId || agent.isOrganizationDefault) {
      return t("organizationDefault");
    }
    return null;
  };
  const impactMetrics = conversationImpact
    ? [
        conversationImpact.cost === null
          ? null
          : {
              key: "cost",
              icon: CircleDollarSignIcon,
              value: `${conversationImpact.cost.toFixed(4)} ${conversationImpact.currency}`,
              label: t("impact.costLabel"),
              description: t("impact.costDescription"),
            },
        conversationImpact.energyKwh === null
          ? null
          : {
              key: "energy",
              icon: ZapIcon,
              value: `${conversationImpact.energyKwh.toFixed(4)} kWh`,
              label: t("impact.energyLabel"),
              description: t("impact.energyDescription"),
            },
      ].filter((metric): metric is NonNullable<typeof metric> => metric !== null)
    : [];
  const agentSelector = (
    <div className="relative z-10 flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none sm:gap-2">
      <DropdownMenu onOpenChange={(open) => !open && setAgentSearch("")}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="min-h-10 min-w-0 flex-1 justify-between gap-2 rounded-xl border-border/65 bg-background/72 px-2.5 text-xs font-medium shadow-[0_1px_2px_rgba(9,30,36,0.035)] transition-[background-color,border-color,box-shadow,scale] hover:border-primary/20 hover:bg-primary/5 active:scale-[0.98] sm:max-w-64 sm:min-w-48" aria-label={t("currentAssistant")}>
            <span className="flex min-w-0 items-center gap-2">
              {selectedAgent ? <ModelLogo logoUrl={selectedAgent.logoUrl} label={selectedAgentLabel} size="sm" imageFit="cover" className="rounded-full" /> : null}
              <span className="min-w-0 truncate text-left">
                <span className="truncate">{selectedAgentLabel}</span>
                {selectedAgent?.modelDisplayName ? (
                  <span className="hidden text-muted-foreground md:inline">
                    {" · "}
                    {selectedAgent.modelDisplayName}
                  </span>
                ) : null}
              </span>
            </span>
            <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-80">
          <div className="p-1" onKeyDown={(event) => event.stopPropagation()}>
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input aria-label={t("assistantSearch")} name="assistant-search" autoComplete="off" value={agentSearch} onChange={(event) => setAgentSearch(event.target.value)} placeholder={t("assistantSearch")} className="h-10 pl-8 text-sm" />
            </div>
          </div>
          {organizationAgents.length > 0 ? (
            <>
              <DropdownMenuLabel>{t("organizationAssistants")}</DropdownMenuLabel>
              {organizationAgents.map((agent) => (
                <DropdownMenuItem key={agent.id} className="min-h-10 gap-2" onClick={() => onSelectAgent(agent.id)}>
                  <ModelLogo logoUrl={agent.logoUrl} label={agent.name} size="sm" imageFit="cover" className="rounded-full" />
                  <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                  {defaultLabelForAgent(agent) ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                      <StarIcon className="size-3" aria-hidden="true" />
                      {defaultLabelForAgent(agent)}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[11px] text-muted-foreground">{agent.modelDisplayName ? t("statusReady") : t("statusNeedsSetup")}</span>
                  )}
                </DropdownMenuItem>
              ))}
            </>
          ) : null}
          {personalAgents.length > 0 ? (
            <>
              {organizationAgents.length > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuLabel>{t("myAssistants")}</DropdownMenuLabel>
              {personalAgents.map((agent) => (
                <DropdownMenuItem key={agent.id} className="min-h-10 gap-2" onClick={() => onSelectAgent(agent.id)}>
                  <ModelLogo logoUrl={agent.logoUrl} label={agent.name} size="sm" imageFit="cover" className="rounded-full" />
                  <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                  {defaultLabelForAgent(agent) ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                      <StarIcon className="size-3" aria-hidden="true" />
                      {defaultLabelForAgent(agent)}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[11px] text-muted-foreground">{agent.modelDisplayName ? t("statusReady") : t("statusNeedsSetup")}</span>
                  )}
                </DropdownMenuItem>
              ))}
            </>
          ) : null}
          {visibleAgents.length === 0 ? <p className="px-2 py-3 text-center text-sm text-muted-foreground">{t("noAssistantMatches")}</p> : null}
          {selectedAgent && onSetUserDefaultAgent ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="min-h-10 gap-2" onClick={() => onSetUserDefaultAgent(selectedAgent.id)}>
                <StarIcon className="size-4" aria-hidden="true" />
                {selectedAgent.id === userDefaultAgentId ? t("myDefaultCurrent") : t("setMyDefault")}
              </DropdownMenuItem>
              {userDefaultAgentId ? (
                <DropdownMenuItem className="min-h-10" onClick={() => onSetUserDefaultAgent(null)}>
                  {t("clearMyDefault")}
                </DropdownMenuItem>
              ) : null}
            </>
          ) : null}
          {selectedAgent ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="min-h-10">
                <Link href={`/agents/${selectedAgent.id}`} className="gap-2">
                  <Settings2Icon className="size-4" aria-hidden="true" />
                  {t("configureAssistant")}
                </Link>
              </DropdownMenuItem>
            </>
          ) : null}
          {canCreateAgent ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="min-h-10">
                <Link href="/agents" className="gap-2">
                  <MessageSquarePlusIcon className="size-4" aria-hidden="true" />
                  {t("createAgent")}
                </Link>
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {selectedAgent ? <ChatToolsMenu key={`${selectedAgent.id}:${activeConversationId ?? "draft"}`} agent={selectedAgent} workspaceId={workspaceId} conversationId={activeConversationId} /> : null}
      {impactMetrics.length > 0 ? (
        <TooltipProvider>
          <div className="flex h-10 shrink-0 flex-col items-stretch overflow-hidden rounded-xl border border-border/55 bg-background/72 shadow-[0_1px_2px_rgba(9,30,36,0.035)] sm:flex-row" aria-label={t("impact.conversationLabel")}>
            {impactMetrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <Tooltip key={metric.key}>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className="flex h-1/2 min-w-0 items-center gap-1 border-t border-border/45 px-1 text-[9px] font-medium tabular-nums text-muted-foreground first:border-t-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 sm:h-auto sm:border-l sm:border-t-0 sm:px-2 sm:text-[11px] sm:first:border-l-0" aria-label={`${metric.label}: ${metric.value}`}>
                      <Icon className="size-3 shrink-0 text-primary/75" aria-hidden="true" />
                      <span className="whitespace-nowrap">{metric.value}</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={8}>
                    <span className="max-w-64">
                      <span className="font-medium">{metric.label}</span>
                      <span className="block opacity-80">{metric.description}</span>
                    </span>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      ) : null}
      {!canChat ? (
        <Badge variant="outline" className="hidden min-h-8 shrink-0 items-center gap-1 rounded-lg border-transparent bg-warning/10 px-2 text-[11px] font-medium text-warning sm:inline-flex">
          <Settings2Icon className="size-3" aria-hidden="true" />
          {t("statusNeedsSetup")}
        </Badge>
      ) : null}
    </div>
  );

  return { kind: "ready", adjustSidebarWidth, agentSelector, canChat, canRunSetup, children, desktopSidebarProps, mobileSidebarOpen, mobileSidebarProps, onNewConversation, onSetupComplete, resizingSidebar, selectedAgentId, setMobileSidebarOpen, setSetupOpen, setupOpen, shell, sidebarOpen, sidebarWidth, startSidebarResize, t, updateSidebarOpen } as const;
}

export function ChatLayout(...args: Parameters<typeof useChatLayoutController>) {
  const model = useChatLayoutController(...args);
  if (!("kind" in model)) return model;
  return <ChatLayoutView model={model} />;
}
