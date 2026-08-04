"use client";

import { Link } from "@/i18n/navigation";
import {
  BookOpenIcon,
  PlugIcon,
  RefreshCwIcon,
  SearchIcon,
  Settings2Icon,
  SparklesIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import {
  readChatCapabilityOverrides,
  writeChatCapabilityOverrides,
  type ChatCapabilityOverrides,
  type ChatToolSource,
} from "@/components/chat/chat-capability-overrides";
import type { ChatAgent } from "@/components/chat/chat-types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { fetchJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type EnabledToolSummary = {
  id: string;
  source: ChatToolSource;
  name: string;
  description: string | null;
  group: string | null;
  requireApproval: boolean;
};

type EnabledSkillSummary = {
  id: string;
  name: string;
  description: string | null;
};

type EnabledToolsPayload = {
  tools: EnabledToolSummary[];
  skills: EnabledSkillSummary[];
};

type Capability = {
  key: string;
  id: string;
  source: ChatToolSource | "skill";
  category: "tools" | "skills" | "mcp";
  name: string;
  description: string;
};

type CapabilityGroup = {
  category: Capability["category"];
  icon: LucideIcon;
  capabilities: Capability[];
};

function toolKey(source: ChatToolSource, id: string) {
  return `${source}:${id}`;
}

function isCapabilityActive(
  capability: Capability,
  overrides: ChatCapabilityOverrides,
) {
  if (capability.source === "skill") {
    return !overrides.disabledSkillIds.includes(capability.id);
  }
  return !overrides.disabledTools.some(
    (tool) => tool.source === capability.source && tool.id === capability.id,
  );
}

export function ChatToolsMenu({
  agent,
  workspaceId,
  conversationId,
}: {
  agent: ChatAgent;
  workspaceId: string | null;
  conversationId: string | null;
}) {
  const t = useTranslations("chat");
  const [open, setOpen] = useState(false);
  const [tools, setTools] = useState<EnabledToolSummary[]>([]);
  const [skills, setSkills] = useState<EnabledSkillSummary[]>([]);
  const [overrides, setOverrides] = useState<ChatCapabilityOverrides>(() =>
    readChatCapabilityOverrides(agent.id, conversationId),
  );
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const refreshOverrides = useCallback(() => {
    setOverrides(readChatCapabilityOverrides(agent.id, conversationId));
  }, [agent.id, conversationId]);

  const loadCapabilities = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const payload = await fetchJson<EnabledToolsPayload>(
        `/api/workspace/agents/${agent.id}/tools?workspaceId=${workspaceId}&includeDetails=true`,
      );
      setTools(payload.tools);
      setSkills(payload.skills ?? []);
      setLoaded(true);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [agent.id, workspaceId]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSearch("");
      return;
    }
    refreshOverrides();
    void loadCapabilities();
  }

  const capabilities = useMemo<Capability[]>(
    () => [
      ...tools.map((tool) => ({
        key: toolKey(tool.source, tool.id),
        id: tool.id,
        source: tool.source,
        category: tool.source === "mcp" ? ("mcp" as const) : ("tools" as const),
        name: tool.name,
        description:
          tool.group ||
          tool.description ||
          (tool.requireApproval
            ? t("toolsMenu.approvalRequired")
            : t("toolsMenu.ready")),
      })),
      ...skills.map((skill) => ({
        key: `skill:${skill.id}`,
        id: skill.id,
        source: "skill" as const,
        category: "skills" as const,
        name: skill.name,
        description: skill.description || t("toolsMenu.skillReady"),
      })),
    ],
    [skills, t, tools],
  );

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleCapabilities = normalizedSearch
    ? capabilities.filter(
        (capability) =>
          capability.name.toLocaleLowerCase().includes(normalizedSearch) ||
          capability.description.toLocaleLowerCase().includes(normalizedSearch),
      )
    : capabilities;

  const groups = useMemo<CapabilityGroup[]>(
    () =>
      [
        { category: "tools" as const, icon: WrenchIcon },
        { category: "skills" as const, icon: BookOpenIcon },
        { category: "mcp" as const, icon: PlugIcon },
      ]
        .map(({ category, icon }) => ({
          category,
          icon,
          capabilities: visibleCapabilities
            .filter((capability) => capability.category === category)
            .sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .filter((group) => group.capabilities.length > 0),
    [visibleCapabilities],
  );

  const activeCount = capabilities.filter((capability) =>
    isCapabilityActive(capability, overrides),
  ).length;
  const fallbackCount = agent.toolCount || 0;
  const displayedActiveCount = loaded ? activeCount : fallbackCount;
  const displayedTotal = loaded ? capabilities.length : fallbackCount;
  const disabledCount = loaded ? displayedTotal - displayedActiveCount : 0;
  const categoryCounts = useMemo(
    () =>
      (["tools", "skills", "mcp"] as const).map((category) => ({
        category,
        count: capabilities.filter(
          (capability) => capability.category === category,
        ).length,
      })),
    [capabilities],
  );

  function persistOverrides(nextOverrides: ChatCapabilityOverrides) {
    setOverrides(nextOverrides);
    writeChatCapabilityOverrides(agent.id, conversationId, nextOverrides);
  }

  function setCapabilityActive(capability: Capability, active: boolean) {
    if (capability.source === "skill") {
      persistOverrides({
        ...overrides,
        disabledSkillIds: active
          ? overrides.disabledSkillIds.filter((id) => id !== capability.id)
          : Array.from(new Set([...overrides.disabledSkillIds, capability.id])),
      });
      return;
    }
    persistOverrides({
      ...overrides,
      disabledTools: active
        ? overrides.disabledTools.filter(
            (tool) =>
              tool.source !== capability.source || tool.id !== capability.id,
          )
        : [
            ...overrides.disabledTools,
            { source: capability.source, id: capability.id },
          ],
    });
  }

  function setGroupActive(group: CapabilityGroup, active: boolean) {
    let next = overrides;
    for (const capability of group.capabilities) {
      if (isCapabilityActive(capability, next) === active) continue;
      if (capability.source === "skill") {
        next = {
          ...next,
          disabledSkillIds: active
            ? next.disabledSkillIds.filter((id) => id !== capability.id)
            : Array.from(new Set([...next.disabledSkillIds, capability.id])),
        };
      } else {
        next = {
          ...next,
          disabledTools: active
            ? next.disabledTools.filter(
                (tool) =>
                  tool.source !== capability.source ||
                  tool.id !== capability.id,
              )
            : [
                ...next.disabledTools,
                { source: capability.source, id: capability.id },
              ],
        };
      }
    }
    persistOverrides(next);
  }

  function resetOverrides() {
    persistOverrides({ disabledTools: [], disabledSkillIds: [] });
  }

  const groupLabel = (category: Capability["category"]) =>
    t(`toolsMenu.groups.${category}`);

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-10 shrink-0 gap-1.5 rounded-xl border-primary/15 bg-primary/6 px-2.5 text-[0.7rem] font-medium text-primary shadow-[0_1px_2px_rgba(9,30,36,0.035)] transition-[background-color,border-color,color,box-shadow,scale] hover:border-primary/25 hover:bg-primary/10 active:scale-[0.96]"
          aria-label={t("toolsMenu.triggerLabel", {
            active: displayedActiveCount,
            total: displayedTotal,
          })}
        >
          <SparklesIcon data-icon="inline-start" aria-hidden="true" />
          <span className="hidden sm:inline">{t("toolsMenu.trigger")}</span>
          <span className="font-mono text-[0.65rem] tabular-nums">
            {displayedActiveCount}
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={12}
        className="w-[min(25rem,calc(100vw-1rem))] overflow-hidden rounded-[1.375rem] p-0"
      >
        <div className="flex items-start justify-between gap-4 px-4 pb-3 pt-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-[-0.02em]">
              {t("toolsMenu.title")}
            </h2>
            <p className="mt-1 text-[0.68rem] text-muted-foreground">
              {t("toolsMenu.activeSummary", {
                active: activeCount,
                total: capabilities.length,
              })}
            </p>
            {loaded ? (
              <div
                role="list"
                aria-label={t("toolsMenu.title")}
                className="mt-2 flex flex-wrap gap-1.5"
              >
                {categoryCounts.map(({ category, count }) => (
                  <span
                    key={category}
                    role="listitem"
                    aria-label={`${groupLabel(category)} ${count}`}
                    className="inline-flex min-h-6 items-center rounded-lg border border-border/55 bg-muted/45 px-2 text-[0.62rem] font-medium text-muted-foreground"
                  >
                    {groupLabel(category)}
                    <span className="ml-1 font-mono tabular-nums text-foreground">
                      {count}
                    </span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {disabledCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-9 shrink-0 rounded-xl px-2.5 text-xs"
              onClick={resetOverrides}
            >
              <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
              {t("toolsMenu.reset")}
            </Button>
          ) : null}
        </div>

        <div
          className="px-3 pb-3"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div className="relative">
            <SearchIcon
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label={t("toolsMenu.search")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("toolsMenu.search")}
              className="h-10 rounded-xl border-transparent bg-muted/65 pl-9 text-sm shadow-none"
            />
          </div>
        </div>

        <div className="max-h-[min(23rem,55vh)] overflow-y-auto border-y border-border/55 px-2 py-2">
          {loading ? (
            <div className="flex flex-col gap-1">
              {Array.from({ length: 5 }, (_, index) => (
                <div
                  key={index}
                  className="flex min-h-12 items-center gap-3 rounded-xl px-2 py-2"
                >
                  <Skeleton className="size-9 shrink-0 rounded-xl" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Skeleton className="h-3 w-2/5" />
                    <Skeleton className="h-2.5 w-4/5" />
                  </div>
                  <Skeleton className="h-4 w-7 shrink-0 rounded-full" />
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div className="flex min-h-36 flex-col items-center justify-center px-4 text-center">
              <p className="text-xs text-muted-foreground">
                {t("toolsMenu.loadError")}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 min-h-10 rounded-xl"
                onClick={() => void loadCapabilities()}
              >
                <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
                {t("toolsMenu.retry")}
              </Button>
            </div>
          ) : groups.length > 0 ? (
            <div className="flex flex-col gap-2">
              {groups.map((group) => {
                const GroupIcon = group.icon;
                const groupActiveCount = group.capabilities.filter(
                  (capability) => isCapabilityActive(capability, overrides),
                ).length;
                const groupActive =
                  groupActiveCount === group.capabilities.length;
                return (
                  <section key={group.category}>
                    <div className="flex min-h-10 items-center gap-2 px-2">
                      <GroupIcon
                        className="size-3.5 text-primary"
                        aria-hidden="true"
                      />
                      <span className="text-[0.68rem] font-medium text-foreground">
                        {groupLabel(group.category)}
                      </span>
                      <span className="font-mono text-[0.62rem] text-muted-foreground tabular-nums">
                        {groupActiveCount}/{group.capabilities.length}
                      </span>
                      <Switch
                        size="sm"
                        checked={groupActive}
                        onCheckedChange={(checked) =>
                          setGroupActive(group, checked)
                        }
                        className="ml-auto"
                        aria-label={t(
                          groupActive
                            ? "toolsMenu.disableGroup"
                            : "toolsMenu.enableGroup",
                          { group: groupLabel(group.category) },
                        )}
                      />
                    </div>

                    <div className="flex flex-col gap-0.5">
                      {group.capabilities.map((capability) => {
                        const active = isCapabilityActive(
                          capability,
                          overrides,
                        );
                        return (
                          <label
                            key={capability.key}
                            className={cn(
                              "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition-[background-color,color,opacity] hover:bg-muted/65",
                              !active && "opacity-55",
                            )}
                          >
                            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/7 text-primary">
                              <GroupIcon
                                className="size-3.5"
                                aria-hidden="true"
                              />
                            </span>
                            <span className="min-w-0 flex-1">
                              <strong className="block truncate text-xs font-medium">
                                {capability.name}
                              </strong>
                              <small className="mt-0.5 block truncate text-[0.65rem] text-muted-foreground">
                                {capability.description}
                              </small>
                            </span>
                            <Switch
                              size="sm"
                              checked={active}
                              onCheckedChange={(checked) =>
                                setCapabilityActive(capability, checked)
                              }
                              aria-label={capability.name}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-32 items-center justify-center px-6 text-center text-xs text-muted-foreground">
              {normalizedSearch
                ? t("toolsMenu.noMatches")
                : t("toolsMenu.empty")}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-3 py-3">
          <p className="min-w-0 truncate pl-1 text-[0.66rem] text-muted-foreground">
            {t("toolsMenu.chatOnly")}
          </p>
          <DropdownMenuGroup>
            <DropdownMenuItem
              asChild
              className="min-h-10 cursor-pointer px-3 text-xs font-medium"
            >
              <Link href={`/agents/${agent.id}`} className="gap-2">
                <Settings2Icon data-icon="inline-start" aria-hidden="true" />
                {t("toolsMenu.customize")}
              </Link>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
