"use client";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageLoading } from "@/components/page-loading";
import { useWorkspace } from "@/hooks/use-workspace";
import { AgentAccessSelection } from "@/modules/agent/access-scope";
import { toast } from "sonner";
import {
  AGENT_TEMPLATES,
  Agent,
  AgentAccessForm,
  AgentAccessOptions,
  slugifyAgentName,
  ICON_SIZE_CLASS,
} from "./page.icon-size-class";
import {
  PlusIcon,
  BotIcon,
  Loader2,
  NetworkIcon,
  ArrowRightIcon,
  EyeIcon,
  EyeOffIcon,
  Grid2X2Icon,
  ListIcon,
  MoreHorizontal,
  PencilIcon,
  SearchIcon,
  Share2,
  StarIcon,
  XIcon,
} from "lucide-react";
import { ResourceAccessDialog } from "@/components/resource-access-dialog";
import { Button } from "@/components/ui/button";
import { WorkspacePage } from "@/components/workspace-page";
import { AdvancedSection } from "@/components/ui/advanced-section";
import { AgentAccessScopePicker } from "@/components/agent-access-scope-picker";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PageEmptyState } from "@/components/page-empty-state";
import { ModelLogo } from "@/components/providers/model-logo";
import { ResourceProvenanceBadge } from "@/components/resource-provenance-badge";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function useAgentsPageController() {
  const t = useTranslations("agents");
  const tList = useTranslations("agents.list");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [canAdminCurate, setCanAdminCurate] = useState(false);
  const [canCreateAgent, setCanCreateAgent] = useState(false);
  const [accessOptions, setAccessOptions] = useState<AgentAccessOptions>({
    scopes: ["private"],
    teams: [],
    projectName: "",
    organizationName: "",
  });
  const [organizationDefaultAgentId, setOrganizationDefaultAgentId] = useState<
    string | null
  >(null);
  const [userDefaultAgentId, setUserDefaultAgentId] = useState<string | null>(
    null,
  );
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [agentKindFilter, setAgentKindFilter] = useState<
    "all" | "assistant" | "orchestrator"
  >("all");
  const [displayMode, setDisplayMode] = useState<"grid" | "list">("grid");
  const [form, setForm] = useState({
    kind: "assistant" as Agent["kind"],
    templateId: "blank",
    name: "",
    slug: "",
    description: "",
    systemPrompt: "",
    promptSuggestions: "",
    sharingMode: "personal" as Agent["sharingMode"],
    shareTargetEmail: "",
    accessScope: "private" as AgentAccessForm["accessScope"],
    accessTeamId: "",
    isGlobal: false,
    isRecommended: false,
    curationLabel: "none",
  });
  const [accessAgent, setAccessAgent] = useState<Agent | null>(null);
  const [updatingDefaultAgentId, setUpdatingDefaultAgentId] = useState<
    string | null
  >(null);
  const abortRef = useRef<AbortController | null>(null);

  const refreshAgents = useCallback(async () => {
    if (!workspaceId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/workspace/agents?workspaceId=${workspaceId}&includeModelMeta=true`,
        {
          signal: controller.signal,
        },
      );
      if (!res.ok) throw new Error("Failed to fetch agents");
      const data = await res.json();
      if (abortRef.current !== controller) return;
      const nextAgents = Array.isArray(data) ? data : data.agents;
      setAgents(nextAgents);
      setCanAdminCurate(Boolean(data.canAdminCurate));
      setCanCreateAgent(Boolean(data.canCreateAgent));
      if (data.accessOptions) setAccessOptions(data.accessOptions);
      setOrganizationDefaultAgentId(data.organizationDefaultAgentId ?? null);
      setUserDefaultAgentId(data.userDefaultAgentId ?? null);
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setLoadError(tList("loadErrorDescription"));
      }
      return;
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, [tList, workspaceId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refreshAgents(), 0);
    return () => {
      window.clearTimeout(timeout);
      abortRef.current?.abort();
    };
  }, [refreshAgents]);

  function applyTemplate(template: (typeof AGENT_TEMPLATES)[number]) {
    const name = tList(template.nameKey);
    setForm((current) => ({
      ...current,
      templateId: template.id,
      name,
      slug: slugifyAgentName(name),
      description: tList(template.descriptionKey),
      systemPrompt: tList(template.promptKey),
      promptSuggestions: template.suggestionKeys
        .map((key) => tList(key))
        .join("\n"),
    }));
  }

  const handleCreate = async () => {
    if (!workspaceId || !form.name.trim()) return;
    const slug = form.slug.trim() || slugifyAgentName(form.name);
    setCreating(true);
    try {
      const res = await fetch("/api/workspace/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: form.kind,
          name: form.name.trim(),
          slug,
          description: form.description.trim() || undefined,
          systemPrompt: form.systemPrompt.trim() || undefined,
          promptSuggestions: form.promptSuggestions
            .split(/\n/)
            .map((suggestion) => suggestion.trim())
            .filter(Boolean),
          workspaceId,
          sharingMode: form.sharingMode,
          shareTargetEmail:
            form.sharingMode === "specific_user"
              ? form.shareTargetEmail.trim()
              : undefined,
          accessScope: form.accessScope,
          accessTeamId:
            form.accessScope === "team" ? form.accessTeamId : undefined,
          isGlobal: canAdminCurate ? form.isGlobal : undefined,
          isRecommended: canAdminCurate ? form.isRecommended : undefined,
          curationLabel: canAdminCurate ? form.curationLabel : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || tList("toastCreateFailed"));
      }

      const data = (await res.json()) as { agent?: Agent };
      toast.success(tList("toastCreated"));
      setShowCreateDialog(false);
      setForm({
        kind: "assistant",
        templateId: "blank",
        name: "",
        slug: "",
        description: "",
        systemPrompt: "",
        promptSuggestions: "",
        sharingMode: "personal",
        shareTargetEmail: "",
        accessScope: "private",
        accessTeamId: "",
        isGlobal: false,
        isRecommended: false,
        curationLabel: "none",
      });
      if (data.agent?.id) {
        router.push(`/agents/${data.agent.id}`);
        return;
      }
      await refreshAgents();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : tList("toastCreateFailed"),
      );
      return;
    } finally {
      setCreating(false);
    }
  };

  async function openAgentAccess(agent: Agent) {
    if (!workspaceId || !agent.canEdit) return;
    try {
      const response = await fetch(
        `/api/workspace/agents/${agent.id}?workspaceId=${workspaceId}`,
      );
      const data = (await response.json().catch(() => ({}))) as Agent & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || tList("toastVisibilityFailed"));
      }
      setAccessAgent(data);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : tList("toastVisibilityFailed"),
      );
    }
  }

  async function saveAgentAccess(selection: AgentAccessSelection) {
    if (!workspaceId || !accessAgent) return;
    const response = await fetch(`/api/workspace/agents/${accessAgent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        baseVersionId: accessAgent.activeVersionId,
        accessScope: selection.scope,
        accessTeamId: selection.scope === "team" ? selection.teamId : undefined,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      agent?: Agent;
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.error || tList("toastVisibilityFailed"));
    }
    setAccessAgent((current) =>
      current
        ? {
            ...current,
            ...(data.agent ?? {}),
            access: selection,
          }
        : null,
    );
  }

  async function setDefaultAgent(
    scope: "organization" | "user",
    agentId: string | null,
    actionAgentId: string,
  ) {
    if (!workspaceId || updatingDefaultAgentId) return;
    setUpdatingDefaultAgentId(actionAgentId);
    try {
      const res = await fetch("/api/workspace/agents/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, scope, defaultAgentId: agentId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || tList("toastDefaultFailed"));
      }
      const data = (await res.json()) as {
        organizationDefaultAgentId: string | null;
        userDefaultAgentId: string | null;
      };
      setOrganizationDefaultAgentId(data.organizationDefaultAgentId ?? null);
      setUserDefaultAgentId(data.userDefaultAgentId ?? null);
      setAgents((current) =>
        current.map((agent) => ({
          ...agent,
          isOrganizationDefault: agent.id === data.organizationDefaultAgentId,
        })),
      );
      toast.success(
        scope === "organization"
          ? tList("toastOrganizationDefaultSaved")
          : tList("toastUserDefaultSaved"),
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : tList("toastDefaultFailed"),
      );
      return;
    } finally {
      setUpdatingDefaultAgentId(null);
    }
  }

  async function setAgentHiddenInChat(agentId: string, hidden: boolean) {
    if (!workspaceId) return;
    try {
      const res = await fetch("/api/workspace/agents/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_hidden",
          workspaceId,
          agentId,
          hidden,
        }),
      });
      if (!res.ok) throw new Error(tList("toastVisibilityFailed"));
      setAgents((current) =>
        current.map((agent) =>
          agent.id === agentId ? { ...agent, hiddenInChat: hidden } : agent,
        ),
      );
      toast.success(tList(hidden ? "toastHiddenFromChat" : "toastShownInChat"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : tList("toastVisibilityFailed"),
      );
    }
  }

  const filteredAgents = agents.filter((agent) => {
    if (agent.hiddenInChat && !agent.canEdit) return false;
    if (agentKindFilter === "assistant" && agent.kind === "orchestrator") {
      return false;
    }
    if (agentKindFilter === "orchestrator" && agent.kind !== "orchestrator") {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      agent.name.toLowerCase().includes(q) ||
      (agent.description ?? "").toLowerCase().includes(q) ||
      agent.slug.toLowerCase().includes(q)
    );
  });

  if (workspaceLoading || !workspaceId) {
    return <PageLoading label={tCommon("loading")} />;
  }

  return {
    kind: "ready",
    accessAgent,
    accessOptions,
    agentKindFilter,
    agents,
    applyTemplate,
    canAdminCurate,
    canCreateAgent,
    creating,
    displayMode,
    filteredAgents,
    form,
    handleCreate,
    loadError,
    loading,
    openAgentAccess,
    organizationDefaultAgentId,
    refreshAgents,
    router,
    saveAgentAccess,
    searchQuery,
    setAccessAgent,
    setAgentKindFilter,
    setDefaultAgent,
    setAgentHiddenInChat,
    setDisplayMode,
    setForm,
    setSearchQuery,
    setShowCreateDialog,
    showCreateDialog,
    t,
    tCommon,
    tList,
    updatingDefaultAgentId,
    userDefaultAgentId,
    workspaceId,
  } as const;
}

export default function AgentsPage(
  ...args: Parameters<typeof useAgentsPageController>
) {
  const model = useAgentsPageController(...args);
  if (!("kind" in model)) return model;
  return <AgentsPageView model={model} />;
}

export type AgentsPageViewModel = Extract<
  ReturnType<typeof useAgentsPageController>,
  { kind: "ready" }
>;
export function AgentsPageView({ model }: { model: AgentsPageViewModel }) {
  const {
    accessAgent,
    accessOptions,
    agents,
    canCreateAgent,
    loading,
    refreshAgents,
    saveAgentAccess,
    setAccessAgent,
    setShowCreateDialog,
    t,
    workspaceId,
  } = model;
  return (
    <WorkspacePage
      title={t("orbitTitle")}
      accentTitle={t("orbitAccent")}
      eyebrow={t("orbitEyebrow")}
      description={t("orbitDescription")}
      width="default"
      actions={
        canCreateAgent && !loading && agents.length > 0 ? (
          <Button size="sm" onClick={() => setShowCreateDialog(true)}>
            <PlusIcon className={ICON_SIZE_CLASS} aria-hidden="true" />
            {t("create")}
          </Button>
        ) : null
      }
    >
      <AgentsPageSection2 model={model} />

      {/* Create dialog */}
      <AgentsPageSection1 model={model} />

      <ResourceAccessDialog
        open={accessAgent !== null}
        workspaceId={workspaceId}
        resource={
          accessAgent
            ? { id: accessAgent.id, name: accessAgent.name, type: "agent" }
            : null
        }
        selection={accessAgent?.access ?? { scope: "private" }}
        options={accessOptions}
        includeDependencies
        onOpenChangeAction={(open) => {
          if (!open) setAccessAgent(null);
        }}
        onScopeSaveAction={saveAgentAccess}
        onSavedAction={refreshAgents}
      />
    </WorkspacePage>
  );
}

export function AgentsPageSection1({ model }: { model: AgentsPageViewModel }) {
  const {
    accessOptions,
    applyTemplate,
    canAdminCurate,
    canCreateAgent,
    creating,
    form,
    handleCreate,
    setForm,
    setShowCreateDialog,
    showCreateDialog,
    t,
    tCommon,
    tList,
  } = model;
  return (
    <Dialog
      open={canCreateAgent && showCreateDialog}
      onOpenChange={setShowCreateDialog}
    >
      <DialogContent className="max-h-[calc(100svh-2rem)] max-w-md overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
          <DialogDescription>{tList("guideDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>{tList("kindLabel")}</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    kind: "assistant" as const,
                    icon: BotIcon,
                    title: tList("kindAssistant"),
                    description: tList("kindAssistantDescription"),
                  },
                  {
                    kind: "orchestrator" as const,
                    icon: NetworkIcon,
                    title: tList("kindOrchestrator"),
                    description: tList("kindOrchestratorDescription"),
                  },
                ] as const
              ).map((option) => {
                const Icon = option.icon;
                const selected = form.kind === option.kind;
                return (
                  <button
                    key={option.kind}
                    type="button"
                    aria-pressed={selected}
                    className={cn(
                      "flex min-h-24 items-start gap-3 rounded-xl border p-3 text-left transition-[background-color,border-color,box-shadow] hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      selected && "border-primary/50 bg-primary/5 shadow-sm",
                    )}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        kind: option.kind,
                        sharingMode:
                          option.kind === "orchestrator"
                            ? "personal"
                            : current.sharingMode,
                      }))
                    }
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {option.title}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>{tList("templateLabel")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {AGENT_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className={cn(
                    "rounded-xl border p-3 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    form.templateId === template.id &&
                      "border-primary/50 bg-primary/5",
                  )}
                  disabled={form.kind === "orchestrator"}
                  onClick={() => applyTemplate(template)}
                >
                  <span className="block font-medium">
                    {tList(template.nameKey)}
                  </span>
                  <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">
                    {tList(template.descriptionKey)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="agent-name">{t("name")}</Label>
            <Input
              id="agent-name"
              name="agent-name"
              autoComplete="off"
              placeholder={t("namePlaceholder")}
              value={form.name}
              onChange={(e) =>
                setForm({
                  ...form,
                  name: e.target.value,
                  slug: slugifyAgentName(e.target.value),
                })
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="agent-description">{t("descriptionLabel")}</Label>
            <Textarea
              id="agent-description"
              name="agent-description"
              placeholder={t("descriptionPlaceholder")}
              value={form.description}
              onChange={(e) =>
                setForm({
                  ...form,
                  description: e.target.value,
                })
              }
            />
          </div>
          <AgentAccessScopePicker
            value={form.accessScope}
            teamId={form.accessTeamId}
            options={accessOptions}
            disabled={creating}
            onChangeAction={(accessScope, accessTeamId) =>
              setForm((current) => ({
                ...current,
                accessScope,
                accessTeamId: accessTeamId ?? "",
              }))
            }
          />
          <AdvancedSection
            label={tCommon("advanced")}
            hint={t("advancedHint")}
            storageKey="advanced:agent-create"
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="agent-slug">{tList("slug")}</Label>
                <Input
                  id="agent-slug"
                  name="agent-slug"
                  autoComplete="off"
                  placeholder={tList("slugPlaceholder")}
                  value={form.slug}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      slug: e.target.value,
                    })
                  }
                />
              </div>
              {canAdminCurate ? (
                <div className="rounded-xl border border-border/70 p-3">
                  <div className="flex flex-col gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="agent-global"
                        checked={form.isGlobal}
                        onCheckedChange={(checked) =>
                          setForm({ ...form, isGlobal: checked === true })
                        }
                      />
                      <label htmlFor="agent-global">{tList("global")}</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="agent-recommended"
                        checked={form.isRecommended}
                        onCheckedChange={(checked) =>
                          setForm({
                            ...form,
                            isRecommended: checked === true,
                          })
                        }
                      />
                      <label htmlFor="agent-recommended">
                        {t("configurePage.recommended")}
                      </label>
                    </div>
                    <Select
                      value={form.curationLabel}
                      onValueChange={(value) =>
                        setForm({ ...form, curationLabel: value })
                      }
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-label={tList("curationLabel")}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          {tList("curationNone")}
                        </SelectItem>
                        <SelectItem value="recommended">
                          {tList("badgeRecommended")}
                        </SelectItem>
                        <SelectItem value="organization_created">
                          {tList("curationOrgCreated")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}
            </div>
          </AdvancedSection>
          <div className="rounded-xl border bg-muted/30 p-3 text-sm">
            <p className="font-medium">{tList("createNextTitle")}</p>
            <p className="mt-1 text-muted-foreground">
              {tList("createNextDescription")}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
            {tCommon("cancel")}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={
              creating ||
              !form.name.trim() ||
              !form.slug.trim() ||
              (form.accessScope === "team" && !form.accessTeamId)
            }
          >
            {creating ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {tList("creating")}
              </>
            ) : (
              tList("createAndConfigure")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AgentsPageSection2({ model }: { model: AgentsPageViewModel }) {
  const {
    agentKindFilter,
    agents,
    canCreateAgent,
    displayMode,
    filteredAgents,
    loadError,
    loading,
    openAgentAccess,
    organizationDefaultAgentId,
    refreshAgents,
    router,
    searchQuery,
    setAgentHiddenInChat,
    setAgentKindFilter,
    setDefaultAgent,
    setDisplayMode,
    setSearchQuery,
    setShowCreateDialog,
    t,
    tCommon,
    tList,
    updatingDefaultAgentId,
    userDefaultAgentId,
  } = model;
  return (
    <div className="flex flex-col gap-6">
      {/* Agents list card */}
      <section
        className={cn(
          "rounded-2xl",
          (loading || loadError || agents.length > 0) && "bg-transparent",
        )}
      >
        {/* Toolbar */}
        {!loading && !loadError && agents.length > 0 ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-72">
              <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label={tList("filterPlaceholder")}
                placeholder={tList("filterPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 bg-card/70 pl-9 text-sm"
              />
              {searchQuery ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-1.5 top-1/2 size-8 -translate-y-1/2"
                  onClick={() => setSearchQuery("")}
                  aria-label={tList("clearSearch")}
                >
                  <XIcon className="size-3" aria-hidden="true" />
                </Button>
              ) : null}
            </div>
            <div
              className="flex w-full items-center rounded-xl bg-muted/60 p-1 sm:ml-auto sm:w-auto"
              role="group"
              aria-label={tList("filterPlaceholder")}
            >
              {(
                [
                  {
                    value: "all",
                    label: tList("filterAll"),
                    count: agents.length,
                  },
                  {
                    value: "assistant",
                    label: tList("filterAssistants"),
                    count: agents.filter(
                      (agent) => agent.kind !== "orchestrator",
                    ).length,
                  },
                  {
                    value: "orchestrator",
                    label: tList("filterOrchestrators"),
                    count: agents.filter(
                      (agent) => agent.kind === "orchestrator",
                    ).length,
                  },
                ] as const
              ).map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={agentKindFilter === filter.value}
                  onClick={() => setAgentKindFilter(filter.value)}
                  className={cn(
                    "flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg px-3 text-xs font-medium transition-[background-color,color,box-shadow] sm:flex-none",
                    agentKindFilter === filter.value
                      ? "bg-card text-foreground shadow-[var(--control-shadow)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {filter.label}
                  <span className="font-mono text-[0.6rem] text-primary">
                    {filter.count}
                  </span>
                </button>
              ))}
            </div>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-11 shrink-0 rounded-xl bg-card/70"
              aria-label={
                displayMode === "grid"
                  ? tList("showAsList")
                  : tList("showAsGrid")
              }
              onClick={() =>
                setDisplayMode((current) =>
                  current === "grid" ? "list" : "grid",
                )
              }
            >
              {displayMode === "grid" ? (
                <Grid2X2Icon className="size-4" aria-hidden="true" />
              ) : (
                <ListIcon className="size-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        ) : null}

        {/* List content */}
        {loading ? (
          <PageLoading
            label={tCommon("loading")}
            className="border-0 shadow-none"
          />
        ) : loadError ? (
          <div className="px-5 py-12 text-center" role="alert">
            <p className="text-sm font-medium">{tList("loadErrorTitle")}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              {loadError}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => void refreshAgents()}
            >
              {tList("retry")}
            </Button>
          </div>
        ) : agents.length === 0 ? (
          <PageEmptyState
            icon={BotIcon}
            title={tList("emptyTitle")}
            description={tList("emptyDescription")}
            className="min-h-[22rem]"
          >
            {canCreateAgent ? (
              <Button onClick={() => setShowCreateDialog(true)}>
                <PlusIcon className={ICON_SIZE_CLASS} aria-hidden="true" />
                {tList("emptyCta")}
              </Button>
            ) : null}
          </PageEmptyState>
        ) : filteredAgents.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            {tList("noMatch", { query: searchQuery })}
          </div>
        ) : (
          <div
            className={cn(
              "grid gap-3 pt-4",
              displayMode === "grid" && "sm:grid-cols-2",
            )}
          >
            {filteredAgents.map((agent) => {
              const isReady = Boolean(
                agent.activeVersionId && agent.modelDisplayName,
              );
              const isOrganizationDefault =
                agent.id === organizationDefaultAgentId ||
                agent.isOrganizationDefault;
              const isUserDefault = agent.id === userDefaultAgentId;

              return (
                <div
                  key={agent.id}
                  className={cn(
                    "group flex min-h-48 min-w-0 flex-col rounded-2xl border border-border/70 bg-card/82 p-4 shadow-[var(--surface-shadow)] transition-[border-color,background-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card hover:shadow-[var(--surface-shadow-hover)]",
                    isOrganizationDefault &&
                      "border-primary/20 bg-primary/[0.025]",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <ModelLogo
                      logoUrl={agent.logoUrl}
                      label={agent.name}
                      size="md"
                      imageFit="cover"
                      className={cn(
                        "rounded-xl",
                        agent.kind === "orchestrator" &&
                          "border border-primary/25 bg-primary/5 text-primary",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold tracking-[-0.015em]">
                        {agent.name}
                      </p>
                      <p className="mt-0.5 truncate text-[0.7rem] text-muted-foreground">
                        {agent.kind === "orchestrator"
                          ? tList("kindOrchestrator")
                          : tList("kindAssistant")}
                        {" · "}
                        {agent.isGlobal
                          ? tList("scopeOrganization")
                          : tList("scopePersonal")}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-10 shrink-0 rounded-full text-muted-foreground transition-[background-color,color,scale] hover:text-foreground active:scale-[0.96]"
                          aria-label={tList("agentActionsNamed", {
                            name: agent.name,
                          })}
                        >
                          <MoreHorizontal
                            className={ICON_SIZE_CLASS}
                            aria-hidden="true"
                          />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        {isReady ? (
                          <DropdownMenuItem
                            className="min-h-10"
                            onClick={() => router.push(`/agents/${agent.id}`)}
                          >
                            <PencilIcon
                              className={ICON_SIZE_CLASS}
                              aria-hidden="true"
                            />
                            {agent.canEdit
                              ? tList("customize")
                              : tList("viewDetails")}
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          className="min-h-10"
                          disabled={updatingDefaultAgentId !== null}
                          onClick={() =>
                            void setDefaultAgent(
                              "user",
                              isUserDefault ? null : agent.id,
                              agent.id,
                            )
                          }
                        >
                          <StarIcon
                            className={cn(
                              ICON_SIZE_CLASS,
                              isUserDefault && "fill-current text-primary",
                            )}
                            aria-hidden="true"
                          />
                          {isUserDefault
                            ? tList("clearMyDefault")
                            : tList("setMyDefault")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="min-h-10"
                          onClick={() =>
                            void setAgentHiddenInChat(
                              agent.id,
                              !agent.hiddenInChat,
                            )
                          }
                        >
                          {agent.hiddenInChat ? (
                            <EyeIcon
                              className={ICON_SIZE_CLASS}
                              aria-hidden="true"
                            />
                          ) : (
                            <EyeOffIcon
                              className={ICON_SIZE_CLASS}
                              aria-hidden="true"
                            />
                          )}
                          {agent.hiddenInChat
                            ? tList("showInChatSelector")
                            : agent.canEdit
                              ? tList("hideFromChatSelector")
                              : tList("removeSharedAssistant")}
                        </DropdownMenuItem>
                        {agent.canEdit && agent.kind !== "orchestrator" ? (
                          <DropdownMenuItem
                            className="min-h-10"
                            onClick={() => void openAgentAccess(agent)}
                          >
                            <Share2
                              className={ICON_SIZE_CLASS}
                              aria-hidden="true"
                            />
                            {tList("manageAccess")}
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <p className="mt-4 min-h-10 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {agent.description || tList("descriptionFallback")}
                  </p>

                  <div className="mt-4 flex min-h-7 flex-wrap items-center gap-1.5">
                    {agent.modelDisplayName ? (
                      <Badge
                        variant="outline"
                        className="rounded-lg border-transparent bg-muted/55 px-2 py-1 text-[0.62rem] font-normal text-muted-foreground"
                      >
                        {agent.modelDisplayName}
                      </Badge>
                    ) : null}
                    {typeof agent.toolCount === "number" ? (
                      <Badge
                        variant="outline"
                        className="rounded-lg border-transparent bg-muted/55 px-2 py-1 text-[0.62rem] font-normal text-muted-foreground"
                      >
                        {tList("toolCount", { count: agent.toolCount })}
                      </Badge>
                    ) : null}
                    <ResourceProvenanceBadge provenance={agent.provenance} />
                    {agent.isRecommended ? (
                      <Badge
                        variant="outline"
                        className="rounded-lg border-transparent bg-primary/8 px-2 py-1 text-[0.62rem] font-normal text-primary"
                      >
                        {tList("badgeRecommended")}
                      </Badge>
                    ) : null}
                    {isOrganizationDefault || isUserDefault ? (
                      <Badge
                        variant="outline"
                        className="rounded-lg border-transparent bg-primary/8 px-2 py-1 text-[0.62rem] font-normal text-primary"
                      >
                        {isUserDefault
                          ? tList("badgeMyDefault")
                          : tList("badgeOrganizationDefault")}
                      </Badge>
                    ) : null}
                    {agent.hiddenInChat ? (
                      <Badge variant="secondary">
                        {tList("hiddenFromChat")}
                      </Badge>
                    ) : null}
                  </div>

                  <div className="mt-auto flex items-center border-t border-border/60 pt-3">
                    <span
                      className={cn(
                        "flex items-center gap-1.5 text-[0.7rem]",
                        isReady ? "text-success" : "text-muted-foreground",
                      )}
                    >
                      <i
                        className={cn(
                          "size-1.5 rounded-full",
                          isReady ? "bg-success" : "bg-muted-foreground/60",
                        )}
                        aria-hidden="true"
                      />
                      {isReady ? t("statusReady") : tList("statusNeedsSetup")}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto min-h-10 gap-1 rounded-xl px-3 text-xs font-medium text-muted-foreground transition-[background-color,color,scale] hover:text-foreground active:scale-[0.96]"
                      onClick={() =>
                        router.push(
                          isReady
                            ? `/chat?agentId=${agent.id}`
                            : `/agents/${agent.id}`,
                        )
                      }
                    >
                      {isReady
                        ? t("chat")
                        : agent.canEdit
                          ? tList("setup")
                          : tList("view")}
                      <ArrowRightIcon className="size-3" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
