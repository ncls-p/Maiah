"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AdvancedSection } from "@/components/ui/advanced-section";
import {
  CopyIcon,
  PlusIcon,
  SearchIcon,
  Loader2,
  MoreHorizontal,
  PencilIcon,
  Trash2Icon,
  Store,
  XIcon,
  Share2,
  StarIcon,
  BotIcon,
  NetworkIcon,
  ArrowRightIcon,
  Grid2X2Icon,
  ListIcon,
} from "lucide-react";

import { PageLoading } from "@/components/page-loading";
import { PageEmptyState } from "@/components/page-empty-state";
import { ModelLogo } from "@/components/providers/model-logo";
import { WorkspacePage } from "@/components/workspace-page";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  ResourceShareDialog,
  type ShareableResource,
} from "@/components/marketplace/resource-share-dialog";
import {
  ResourceProvenanceBadge,
  type ResourceProvenance,
} from "@/components/resource-provenance-badge";
import { useWorkspace } from "@/hooks/use-workspace";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ICON_SIZE_CLASS = "size-4";

const AGENT_TEMPLATES = [
  {
    id: "support",
    nameKey: "templates.support.name",
    descriptionKey: "templates.support.description",
    promptKey: "templates.support.prompt",
    suggestionKeys: [
      "templates.support.suggestions.0",
      "templates.support.suggestions.1",
      "templates.support.suggestions.2",
    ],
  },
  {
    id: "hr",
    nameKey: "templates.hr.name",
    descriptionKey: "templates.hr.description",
    promptKey: "templates.hr.prompt",
    suggestionKeys: [
      "templates.hr.suggestions.0",
      "templates.hr.suggestions.1",
      "templates.hr.suggestions.2",
    ],
  },
  {
    id: "documents",
    nameKey: "templates.documents.name",
    descriptionKey: "templates.documents.description",
    promptKey: "templates.documents.prompt",
    suggestionKeys: [
      "templates.documents.suggestions.0",
      "templates.documents.suggestions.1",
      "templates.documents.suggestions.2",
    ],
  },
  {
    id: "sales",
    nameKey: "templates.sales.name",
    descriptionKey: "templates.sales.description",
    promptKey: "templates.sales.prompt",
    suggestionKeys: [
      "templates.sales.suggestions.0",
      "templates.sales.suggestions.1",
      "templates.sales.suggestions.2",
    ],
  },
  {
    id: "project",
    nameKey: "templates.project.name",
    descriptionKey: "templates.project.description",
    promptKey: "templates.project.prompt",
    suggestionKeys: [
      "templates.project.suggestions.0",
      "templates.project.suggestions.1",
      "templates.project.suggestions.2",
    ],
  },
  {
    id: "blank",
    nameKey: "templates.blank.name",
    descriptionKey: "templates.blank.description",
    promptKey: "templates.blank.prompt",
    suggestionKeys: [
      "templates.blank.suggestions.0",
      "templates.blank.suggestions.1",
      "templates.blank.suggestions.2",
    ],
  },
] as const;

interface Agent {
  id: string;
  kind: "assistant" | "orchestrator";
  name: string;
  slug: string;
  description: string | null;
  logoUrl?: string | null;
  activeVersionId: string | null;
  modelDisplayName?: string | null;
  toolCount?: number;
  promptSuggestions?: string[];
  organizationDisplayOrder?: number;
  isOrganizationDefault?: boolean;
  sharingMode: "personal" | "marketplace" | "specific_user";
  isGlobal: boolean;
  isRecommended: boolean;
  curationLabel: string | null;
  canEdit?: boolean;
  canClone?: boolean;
  createdAt: string;
  updatedAt: string;
  provenance: ResourceProvenance;
}

function slugifyAgentName(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "assistant"
  );
}

export default function AgentsPage() {
  const t = useTranslations("agents");
  const tList = useTranslations("agents.list");
  const tCommon = useTranslations("common");
  const tShare = useTranslations("marketplace.share");
  const router = useRouter();
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [canAdminCurate, setCanAdminCurate] = useState(false);
  const [canCreateAgent, setCanCreateAgent] = useState(false);
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
    isGlobal: false,
    isRecommended: false,
    curationLabel: "none",
  });
  const [shareResource, setShareResource] = useState<ShareableResource | null>(
    null,
  );
  const [deleteAgentId, setDeleteAgentId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
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

  const handleDelete = async () => {
    if (!workspaceId || !deleteAgentId) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/workspace/agents/${deleteAgentId}?workspaceId=${workspaceId}`,
        {
          method: "DELETE",
        },
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || tList("toastDeleteFailed"));
      }

      toast.success(tList("toastDeleted"));
      setDeleteAgentId(null);
      await refreshAgents();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : tList("toastDeleteFailed"),
      );
      return;
    } finally {
      setDeleting(false);
    }
  };

  async function cloneAgent(agent: Agent) {
    if (!workspaceId) return;
    try {
      const res = await fetch(`/api/workspace/agents/${agent.id}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || tList("toastCloneFailed"));
      }
      const data = (await res.json()) as { agent?: Agent };
      toast.success(tList("toastCloned"));
      await refreshAgents();
      if (data.agent?.id) router.push(`/agents/${data.agent.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : tList("toastCloneFailed"),
      );
      return;
    }
  }

  async function publishAgent(agent: Agent) {
    if (!workspaceId) return;
    try {
      const res = await fetch("/api/marketplace/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          agentId: agent.id,
          version: "1.0.0",
          name: agent.name,
          description: agent.description || "",
          draftOnly: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Publication échouée");
      }
      toast.success(tShare("publishedDraft"));
      await refreshAgents();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Une erreur est survenue",
      );
      return;
    }
  }

  async function setDefaultAgent(
    scope: "organization" | "user",
    agentId: string | null,
  ) {
    if (!workspaceId) return;
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
    }
  }

  const filteredAgents = agents.filter((agent) => {
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
                            size="icon-sm"
                            variant="ghost"
                            className="shrink-0 rounded-lg text-muted-foreground"
                            aria-label={tList("agentActions")}
                          >
                            <MoreHorizontal
                              className={ICON_SIZE_CLASS}
                              aria-hidden="true"
                            />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => router.push(`/agents/${agent.id}`)}
                          >
                            <PencilIcon className={ICON_SIZE_CLASS} />
                            {agent.canEdit ? t("configure") : tList("view")}
                          </DropdownMenuItem>
                          {agent.canClone !== false ? (
                            <DropdownMenuItem
                              onClick={() => void cloneAgent(agent)}
                            >
                              <CopyIcon className={ICON_SIZE_CLASS} />
                              {tList("clone")}
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem
                            onClick={() =>
                              void setDefaultAgent("user", agent.id)
                            }
                          >
                            <StarIcon className={ICON_SIZE_CLASS} />
                            {isUserDefault
                              ? tList("myDefaultCurrent")
                              : tList("setMyDefault")}
                          </DropdownMenuItem>
                          {agent.canEdit && agent.kind !== "orchestrator" ? (
                            <DropdownMenuItem
                              onClick={() =>
                                setShareResource({
                                  kind: "agent",
                                  id: agent.id,
                                  name: agent.name,
                                  description: agent.description,
                                })
                              }
                            >
                              <Share2 className={ICON_SIZE_CLASS} />
                              {tShare("action")}
                            </DropdownMenuItem>
                          ) : null}
                          {agent.canEdit && agent.kind !== "orchestrator" ? (
                            <DropdownMenuItem
                              onClick={() => void publishAgent(agent)}
                            >
                              <Store className={ICON_SIZE_CLASS} />
                              {tShare("publish")}
                            </DropdownMenuItem>
                          ) : null}
                          {agent.canEdit ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setDeleteAgentId(agent.id)}
                              >
                                <Trash2Icon className={ICON_SIZE_CLASS} />
                                {t("configurePage.delete")}
                              </DropdownMenuItem>
                            </>
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
                        className="ml-auto h-8 gap-1 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          router.push(
                            isReady
                              ? `/chat?agentId=${agent.id}`
                              : `/agents/${agent.id}`,
                          )
                        }
                      >
                        {isReady ? t("chat") : tList("setup")}
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

      {/* Create dialog */}
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
                {form.kind === "assistant" ? (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="agent-sharing">{tList("access")}</Label>
                    <Select
                      value={form.sharingMode}
                      onValueChange={(value) =>
                        setForm({
                          ...form,
                          sharingMode: value as Agent["sharingMode"],
                        })
                      }
                    >
                      <SelectTrigger id="agent-sharing" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="personal">
                          {t("configurePage.sharingPersonal")}
                        </SelectItem>
                        <SelectItem value="marketplace">
                          {t("configurePage.sharingWorkspace")}
                        </SelectItem>
                        <SelectItem value="specific_user">
                          {t("configurePage.sharingUser")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <p className="rounded-xl border border-info/25 bg-info/5 p-3 text-xs leading-relaxed text-muted-foreground">
                    {tList("orchestratorMarketplaceHint")}
                  </p>
                )}
                {form.sharingMode === "specific_user" ? (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="agent-share-email">
                      {tList("userEmail")}
                    </Label>
                    <Input
                      id="agent-share-email"
                      name="agent-share-email"
                      type="email"
                      autoComplete="email"
                      spellCheck={false}
                      value={form.shareTargetEmail}
                      onChange={(e) =>
                        setForm({ ...form, shareTargetEmail: e.target.value })
                      }
                    />
                  </div>
                ) : null}
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
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                creating ||
                !form.name.trim() ||
                !form.slug.trim() ||
                (form.sharingMode === "specific_user" &&
                  !form.shareTargetEmail.trim())
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

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteAgentId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteAgentId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tList("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tList("deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {tCommon("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {deleting ? tList("deleting") : t("configurePage.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ResourceShareDialog
        resource={shareResource}
        workspaceId={workspaceId}
        open={shareResource !== null}
        onCloseAction={() => setShareResource(null)}
      />
    </WorkspacePage>
  );
}
