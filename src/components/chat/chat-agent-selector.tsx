"use client";
import { ChevronDownIcon, MessageSquarePlusIcon, SearchIcon, Settings2Icon, StarIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { ChatToolsMenu } from "@/components/chat/chat-tools-menu";
import { ConversationShareDialog } from "@/components/chat/conversation-share-dialog";
import { ChatAgent } from "@/components/chat/chat-types";
import { ModelLogo } from "@/components/providers/model-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface ChatAgentSelectorProps {
  agents: ChatAgent[];
  selectedAgent: ChatAgent | null;
  activeConversationId: string | null;
  conversationIsOwner: boolean;
  workspaceId: string | null;
  organizationDefaultAgentId?: string | null;
  userDefaultAgentId?: string | null;
  isLoading: boolean;
  needsSetup: boolean;
  canCreateAgent: boolean;
  onSelectAgent: (agentId: string) => void;
  onSetUserDefaultAgent?: (agentId: string | null) => void;
}

function SelectedAssistantTrigger(props: {
  isLoading: boolean;
  selectedAgent: ChatAgent | null;
  selectedLabel: string;
}) {
  if (props.isLoading && !props.selectedAgent) {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <Skeleton className="size-6 shrink-0 rounded-full" />
        <span className="min-w-0 flex-1 text-left leading-tight">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-0.5 hidden h-2.5 w-20 sm:block" />
        </span>
      </span>
    );
  }
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      {props.selectedAgent ? (
        <ModelLogo
          logoUrl={props.selectedAgent.logoUrl}
          label={props.selectedLabel}
          size="sm"
          imageFit="cover"
          className="rounded-full"
        />
      ) : null}
      <span className="min-w-0 flex-1 overflow-hidden text-left leading-tight">
        <span className="block truncate">{props.selectedLabel}</span>
        {props.selectedAgent?.modelDisplayName ? (
          <span className="mt-0.5 hidden truncate text-[11px] font-normal text-muted-foreground sm:block">
            {props.selectedAgent.modelDisplayName}
          </span>
        ) : null}
      </span>
    </span>
  );
}

export function ChatAgentSelector(props: ChatAgentSelectorProps) {
  const t = useTranslations("chat");
  const [search, setSearch] = useState("");
  const selectedLabel = props.selectedAgent?.name ?? t("chooseAssistant");
  const query = search.trim().toLowerCase();
  const visibleAgents = query
    ? props.agents.filter(
        (agent) =>
          agent.name.toLowerCase().includes(query) ||
          (agent.description ?? "").toLowerCase().includes(query),
      )
    : props.agents;
  const organizationAgents = visibleAgents.filter(
    (agent) => agent.isGlobal || agent.isRecommended || agent.canEdit === false,
  );
  const personalAgents = visibleAgents.filter(
    (agent) =>
      agent.isGlobal !== true &&
      agent.isRecommended !== true &&
      agent.canEdit !== false,
  );

  function defaultLabel(agent: ChatAgent) {
    if (agent.id === props.userDefaultAgentId) return t("myDefault");
    if (
      agent.id === props.organizationDefaultAgentId ||
      agent.isOrganizationDefault
    )
      return t("organizationDefault");
    return null;
  }

  const renderAgents = (agents: ChatAgent[]) =>
    agents.map((agent) => (
      <AgentOption
        key={agent.id}
        agent={agent}
        defaultLabel={defaultLabel(agent)}
        onSelect={() => props.onSelectAgent(agent.id)}
      />
    ));

  return (
    <div className="relative z-10 grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 overflow-hidden sm:flex sm:flex-nowrap sm:gap-2 sm:overflow-visible">
      <DropdownMenu onOpenChange={(open) => !open && setSearch("")}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 w-full min-w-0 shrink justify-between gap-2 overflow-hidden rounded-xl border-border/65 bg-background/72 px-2.5 text-xs font-medium shadow-[0_1px_2px_rgba(9,30,36,0.035)] transition-[background-color,border-color,box-shadow,scale] hover:border-primary/20 hover:bg-primary/5 active:scale-[0.98] sm:max-w-80 sm:flex-[0_1_20rem]"
            aria-busy={props.isLoading && !props.selectedAgent}
            aria-label={t("currentAssistant")}
            title={props.selectedAgent ? selectedLabel : undefined}
            disabled={props.isLoading && !props.selectedAgent}
          >
            <SelectedAssistantTrigger
              isLoading={props.isLoading}
              selectedAgent={props.selectedAgent}
              selectedLabel={selectedLabel}
            />
            <ChevronDownIcon
              className="hidden size-3.5 shrink-0 text-muted-foreground sm:block"
              aria-hidden="true"
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-80">
          <div className="p-1" onKeyDown={(event) => event.stopPropagation()}>
            <div className="relative">
              <SearchIcon
                className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                aria-label={t("assistantSearch")}
                name="assistant-search"
                autoComplete="off"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("assistantSearch")}
                className="h-10 pl-8 text-sm"
              />
            </div>
          </div>
          {organizationAgents.length > 0 ? (
            <>
              <DropdownMenuLabel>
                {t("organizationAssistants")}
              </DropdownMenuLabel>
              {renderAgents(organizationAgents)}
            </>
          ) : null}
          {personalAgents.length > 0 ? (
            <>
              {organizationAgents.length > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuLabel>{t("myAssistants")}</DropdownMenuLabel>
              {renderAgents(personalAgents)}
            </>
          ) : null}
          {visibleAgents.length === 0 ? (
            <p className="px-2 py-3 text-center text-sm text-muted-foreground">
              {t("noAssistantMatches")}
            </p>
          ) : null}
          {props.selectedAgent && props.onSetUserDefaultAgent ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="min-h-10 gap-2"
                onClick={() =>
                  props.onSetUserDefaultAgent?.(props.selectedAgent!.id)
                }
              >
                <StarIcon className="size-4" aria-hidden="true" />
                {props.selectedAgent.id === props.userDefaultAgentId
                  ? t("myDefaultCurrent")
                  : t("setMyDefault")}
              </DropdownMenuItem>
              {props.userDefaultAgentId ? (
                <DropdownMenuItem
                  className="min-h-10"
                  onClick={() => props.onSetUserDefaultAgent?.(null)}
                >
                  {t("clearMyDefault")}
                </DropdownMenuItem>
              ) : null}
            </>
          ) : null}
          {props.selectedAgent ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="min-h-10">
                <Link
                  href={`/agents/${props.selectedAgent.id}`}
                  className="gap-2"
                >
                  <Settings2Icon className="size-4" aria-hidden="true" />
                  {t("configureAssistant")}
                </Link>
              </DropdownMenuItem>
            </>
          ) : null}
          {props.canCreateAgent ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="min-h-10">
                <Link href="/agents" className="gap-2">
                  <MessageSquarePlusIcon
                    className="size-4"
                    aria-hidden="true"
                  />
                  {t("createAgent")}
                </Link>
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {props.selectedAgent ? (
        <ChatToolsMenu
          key={`${props.selectedAgent.id}:${props.activeConversationId ?? "draft"}`}
          agent={props.selectedAgent}
          workspaceId={props.workspaceId}
          conversationId={props.activeConversationId}
        />
      ) : null}
      {props.activeConversationId && props.conversationIsOwner ? (
        <ConversationShareDialog conversationId={props.activeConversationId} />
      ) : null}
      {props.needsSetup ? (
        <Badge
          variant="outline"
          className="hidden min-h-8 shrink-0 items-center gap-1 rounded-lg border-transparent bg-warning/10 px-2 text-[11px] font-medium text-warning sm:inline-flex"
        >
          <Settings2Icon className="size-3" aria-hidden="true" />
          {t("statusNeedsSetup")}
        </Badge>
      ) : null}
    </div>
  );
}


export function AgentOption({
  agent,
  defaultLabel,
  onSelect,
}: {
  agent: ChatAgent;
  defaultLabel: string | null;
  onSelect: () => void;
}) {
  const t = useTranslations("chat");
  return (
    <DropdownMenuItem className="min-h-10 gap-2" onClick={onSelect}>
      <ModelLogo
        logoUrl={agent.logoUrl}
        label={agent.name}
        size="sm"
        imageFit="cover"
        className="rounded-full"
      />
      <span className="min-w-0 flex-1 truncate">{agent.name}</span>
      {defaultLabel ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
          <StarIcon className="size-3" aria-hidden="true" />
          {defaultLabel}
        </span>
      ) : (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {agent.modelDisplayName ? t("statusReady") : t("statusNeedsSetup")}
        </span>
      )}
    </DropdownMenuItem>
  );
}

