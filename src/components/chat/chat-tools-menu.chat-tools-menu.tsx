"use client";

import { BookMarkedIcon, BookOpenIcon, Grid2X2Icon, ListIcon, PlugIcon, RefreshCwIcon, SparklesIcon, WrenchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback,useMemo,useState } from "react";

import { readChatCapabilityOverrides,writeChatCapabilityOverrides,type ChatCapabilityOverrides } from "@/components/chat/chat-capability-overrides";
import type { ChatAgent } from "@/components/chat/chat-types";
import { Button } from "@/components/ui/button";
import { DropdownMenu,DropdownMenuContent,DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { fetchJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Capability,CapabilityGroup,EnabledKnowledgeSummary,EnabledSkillSummary,EnabledToolSummary,EnabledToolsPayload,isCapabilityActive,toolKey } from "./chat-tools-menu.enabled-tool-summary";
import { ChatCapabilityFooter, ChatCapabilitySearch, ChatCapabilitySidebar, type ChatCapabilityCategory } from "./chat-tools-menu.catalog-navigation";

export function ChatToolsMenu({ agent, workspaceId, conversationId }: { agent: ChatAgent; workspaceId: string | null; conversationId: string | null }) {
  const t = useTranslations("chat");
  const [open, setOpen] = useState(false);
  const [tools, setTools] = useState<EnabledToolSummary[]>([]);
  const [skills, setSkills] = useState<EnabledSkillSummary[]>([]);
  const [knowledge, setKnowledge] = useState<EnabledKnowledgeSummary[]>([]);
  const [overrides, setOverrides] = useState<ChatCapabilityOverrides>(() => readChatCapabilityOverrides(agent.id, conversationId));
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<ChatCapabilityCategory>("all");
  const [displayMode, setDisplayMode] = useState<"grid" | "list">("list");

  const refreshOverrides = useCallback(() => {
    setOverrides(readChatCapabilityOverrides(agent.id, conversationId));
  }, [agent.id, conversationId]);

  const loadCapabilities = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const payload = await fetchJson<EnabledToolsPayload>(`/api/workspace/agents/${agent.id}/tools?workspaceId=${workspaceId}&includeDetails=true&includeAvailable=true`);
      setTools(payload.tools);
      setSkills(payload.skills ?? []);
      setKnowledge(payload.knowledge ?? []);
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
        description: tool.group || tool.description || (tool.requireApproval ? t("toolsMenu.approvalRequired") : t("toolsMenu.ready")),
        attached: tool.attached ?? true,
      })),
      ...skills.map((skill) => ({
        key: `skill:${skill.id}`,
        id: skill.id,
        source: "skill" as const,
        category: "skills" as const,
        name: skill.name,
        description: skill.description || t("toolsMenu.skillReady"),
        attached: skill.attached ?? true,
      })),
      ...knowledge.map((item) => ({ key: `knowledge:${item.id}`, id: item.id, source: "knowledge" as const, category: "knowledge" as const, name: item.name, description: item.description || t("toolsMenu.knowledgeReady"), attached: item.attached ?? true })),
    ],
    [knowledge, skills, t, tools],
  );

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleCapabilities = capabilities.filter((capability) => (categoryFilter === "all" || capability.category === categoryFilter) && (!normalizedSearch || capability.name.toLocaleLowerCase().includes(normalizedSearch) || capability.description.toLocaleLowerCase().includes(normalizedSearch)));

  const groups = useMemo<CapabilityGroup[]>(
    () =>
      [
        { category: "tools" as const, icon: WrenchIcon },
        { category: "skills" as const, icon: BookMarkedIcon },
        { category: "mcp" as const, icon: PlugIcon },
        { category: "knowledge" as const, icon: BookOpenIcon },
      ]
        .map(({ category, icon }) => ({
          category,
          icon,
          capabilities: visibleCapabilities.filter((capability) => capability.category === category).sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .filter((group) => group.capabilities.length > 0),
    [visibleCapabilities],
  );

  const activeCount = capabilities.filter((capability) => isCapabilityActive(capability, overrides)).length;
  const fallbackCount = agent.toolCount || 0;
  const displayedActiveCount = loaded ? activeCount : fallbackCount;
  const displayedTotal = loaded ? capabilities.length : fallbackCount;
  const categoryCounts = useMemo(
    () =>
      (["tools", "skills", "mcp", "knowledge"] as const).map((category) => ({
        category,
        count: capabilities.filter((capability) => capability.category === category).length,
      })),
    [capabilities],
  );

  function persistOverrides(nextOverrides: ChatCapabilityOverrides) {
    setOverrides(nextOverrides);
    writeChatCapabilityOverrides(agent.id, conversationId, nextOverrides);
  }

  function setCapabilityActive(capability: Capability, active: boolean) {
    if (capability.source === "knowledge") {
      persistOverrides({ ...overrides, enabledKnowledgeIds: active ? Array.from(new Set([...overrides.enabledKnowledgeIds, capability.id])) : overrides.enabledKnowledgeIds.filter((id) => id !== capability.id) });
      return;
    }
    if (capability.source === "skill") {
      persistOverrides({
        ...overrides,
        ...(capability.attached
          ? { disabledSkillIds: active ? overrides.disabledSkillIds.filter((id) => id !== capability.id) : Array.from(new Set([...overrides.disabledSkillIds, capability.id])) }
          : { enabledSkillIds: active ? Array.from(new Set([...overrides.enabledSkillIds, capability.id])) : overrides.enabledSkillIds.filter((id) => id !== capability.id) }),
      });
      return;
    }
    persistOverrides({
      ...overrides,
      ...(capability.attached
        ? { disabledTools: active ? overrides.disabledTools.filter((tool) => tool.source !== capability.source || tool.id !== capability.id) : [...overrides.disabledTools, { source: capability.source, id: capability.id }] }
        : { enabledTools: active ? [...overrides.enabledTools, { source: capability.source, id: capability.id }] : overrides.enabledTools.filter((tool) => tool.source !== capability.source || tool.id !== capability.id) }),
    });
  }

  function setGroupActive(group: CapabilityGroup, active: boolean) {
    let next = overrides;
    for (const capability of group.capabilities) {
      if (isCapabilityActive(capability, next) === active) continue;
      if (capability.source === "knowledge") {
        next = { ...next, enabledKnowledgeIds: active ? Array.from(new Set([...next.enabledKnowledgeIds, capability.id])) : next.enabledKnowledgeIds.filter((id) => id !== capability.id) };
        continue;
      }
      if (capability.source === "skill") {
        next = capability.attached ? { ...next, disabledSkillIds: active ? next.disabledSkillIds.filter((id) => id !== capability.id) : Array.from(new Set([...next.disabledSkillIds, capability.id])) } : { ...next, enabledSkillIds: active ? Array.from(new Set([...next.enabledSkillIds, capability.id])) : next.enabledSkillIds.filter((id) => id !== capability.id) };
      } else {
        next = capability.attached ? { ...next, disabledTools: active ? next.disabledTools.filter((tool) => tool.source !== capability.source || tool.id !== capability.id) : [...next.disabledTools, { source: capability.source, id: capability.id }] } : { ...next, enabledTools: active ? [...next.enabledTools, { source: capability.source, id: capability.id }] : next.enabledTools.filter((tool) => tool.source !== capability.source || tool.id !== capability.id) };
      }
    }
    persistOverrides(next);
  }

  function resetOverrides() {
    persistOverrides({ disabledTools: [], disabledSkillIds: [], enabledTools: [], enabledSkillIds: [], enabledKnowledgeIds: [] });
  }

  const groupLabel = (category: Capability["category"]) => t(`toolsMenu.groups.${category}`);

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
          <span className="font-mono text-[0.65rem] tabular-nums">{displayedActiveCount}</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" sideOffset={12} className="flex h-[min(42rem,calc(100dvh-1rem))] w-[min(42rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-[1.375rem] p-0">
        <div className="flex shrink-0 items-start justify-between gap-4 px-4 pb-3 pt-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-[-0.02em]">{t("toolsMenu.title")}</h2>
            <p className="mt-1 text-[0.68rem] text-muted-foreground">
              {t("toolsMenu.activeSummary", {
                active: activeCount,
                total: capabilities.length,
              })}
            </p>
            {loaded ? (
              <div role="list" aria-label={t("toolsMenu.title")} className="mt-2 flex flex-wrap gap-1.5">
                {categoryCounts.map(({ category, count }) => (
                  <span key={category} role="listitem" aria-label={`${groupLabel(category)} ${count}`} className="inline-flex min-h-6 items-center rounded-lg border border-border/55 bg-muted/45 px-2 text-[0.62rem] font-medium text-muted-foreground">
                    {groupLabel(category)}
                    <span className="ml-1 font-mono tabular-nums text-foreground">{count}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-1">
          <Button type="button" variant="ghost" size="icon" className="size-9 rounded-xl" aria-label={t(displayMode === "grid" ? "toolsMenu.showList" : "toolsMenu.showGrid")} onClick={() => setDisplayMode((current) => current === "grid" ? "list" : "grid")}>
            {displayMode === "grid" ? <ListIcon className="size-4" aria-hidden="true" /> : <Grid2X2Icon className="size-4" aria-hidden="true" />}
          </Button>
          {overrides.disabledTools.length + overrides.disabledSkillIds.length + overrides.enabledTools.length + overrides.enabledSkillIds.length + overrides.enabledKnowledgeIds.length > 0 ? (
            <Button type="button" variant="ghost" size="sm" className="min-h-9 shrink-0 rounded-xl px-2.5 text-xs" onClick={resetOverrides}>
              <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
              {t("toolsMenu.reset")}
            </Button>
          ) : null}
          </div>
        </div>

        <ChatCapabilitySearch value={search} onChange={setSearch} label={t("toolsMenu.search")} />

        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] border-y border-border/55 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:grid-rows-1">
          <ChatCapabilitySidebar category={categoryFilter} setCategory={setCategoryFilter} capabilities={capabilities} label={t("toolsMenu.groups.all")} groupLabel={groupLabel} />
          <div data-slot="chat-capability-results" className="min-h-0 overflow-y-auto overscroll-contain px-2 py-2 [scrollbar-gutter:stable]">
          {loading ? (
            <div className="flex flex-col gap-1">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="flex min-h-12 items-center gap-3 rounded-xl px-2 py-2">
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
              <p className="text-xs text-muted-foreground">{t("toolsMenu.loadError")}</p>
              <Button type="button" variant="ghost" size="sm" className="mt-2 min-h-10 rounded-xl" onClick={() => void loadCapabilities()}>
                <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
                {t("toolsMenu.retry")}
              </Button>
            </div>
          ) : groups.length > 0 ? (
            <div className={cn("grid gap-2", displayMode === "grid" && "sm:grid-cols-2")}>
              {groups.map((group) => {
                const GroupIcon = group.icon;
                const groupActiveCount = group.capabilities.filter((capability) => isCapabilityActive(capability, overrides)).length;
                const groupActive = groupActiveCount === group.capabilities.length;
                return (
                  <section key={group.category}>
                    <div className="flex min-h-10 items-center gap-2 px-2">
                      <GroupIcon className="size-3.5 text-primary" aria-hidden="true" />
                      <span className="text-[0.68rem] font-medium text-foreground">{groupLabel(group.category)}</span>
                      <span className="font-mono text-[0.62rem] text-muted-foreground tabular-nums">
                        {groupActiveCount}/{group.capabilities.length}
                      </span>
                      <Switch size="sm" checked={groupActive} onCheckedChange={(checked) => setGroupActive(group, checked)} className="ml-auto" aria-label={t(groupActive ? "toolsMenu.disableGroup" : "toolsMenu.enableGroup", { group: groupLabel(group.category) })} />
                    </div>

                    <div className="flex flex-col gap-0.5">
                      {group.capabilities.map((capability) => {
                        const active = isCapabilityActive(capability, overrides);
                        return (
                          <label key={capability.key} className={cn("flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition-[background-color,color,opacity] hover:bg-muted/65", !active && "opacity-55")}>
                            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/7 text-primary">
                              <GroupIcon className="size-3.5" aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <strong className="block truncate text-xs font-medium">{capability.name}</strong>
                              <small className="mt-0.5 block truncate text-[0.65rem] text-muted-foreground">{capability.description}</small>
                            </span>
                            <Switch size="sm" checked={active} onCheckedChange={(checked) => setCapabilityActive(capability, checked)} aria-label={capability.name} />
                          </label>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-32 items-center justify-center px-6 text-center text-xs text-muted-foreground">{normalizedSearch ? t("toolsMenu.noMatches") : t("toolsMenu.empty")}</div>
          )}
          </div>
        </div>

        <ChatCapabilityFooter agentId={agent.id} chatOnly={t("toolsMenu.chatOnly")} customize={t("toolsMenu.customize")} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
