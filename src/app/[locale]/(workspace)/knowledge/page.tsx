"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { useTranslations } from "next-intl";
import {
  BookOpenIcon,
  FileTextIcon,
  Loader2,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { toast } from "sonner";
import { PageEmptyState } from "@/components/page-empty-state";
import { PageLoading } from "@/components/page-loading";
import { ModelLogo } from "@/components/providers/model-logo";
import { WorkspacePage } from "@/components/workspace-page";
import { AdvancedSection } from "@/components/ui/advanced-section";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ResourceProvenanceBadge,
  type ResourceProvenance,
} from "@/components/resource-provenance-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchWorkspacePermissions } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { RagConfig } from "@/modules/knowledge/rag-config";

interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  isGlobal: boolean;
  canEdit: boolean;
  createdAt: string;
  provenance: ResourceProvenance;
  effectiveRagConfig: RagConfig;
  usesDefaultRagConfig: boolean;
}
interface DocumentRow {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}
interface SearchResult {
  chunkId: string;
  documentTitle: string;
  content: string;
  score: number;
}
interface KnowledgeAgent {
  id: string;
  name: string;
  description: string | null;
  activeVersionId: string | null;
  logoUrl?: string | null;
  modelDisplayName?: string | null;
  canEdit?: boolean;
}

function statusVariant(status: string) {
  if (status === "ready") return "secondary" as const;
  if (status === "processing") return "outline" as const;
  return "destructive" as const;
}

function statusLabel(status: string, t: (key: string) => string) {
  if (status === "ready") return t("statusReady");
  if (status === "processing") return t("statusProcessing");
  return t("statusFailed");
}

export default function KnowledgePage() {
  const t = useTranslations("knowledge");
  const tCommon = useTranslations("common");
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [documentsError, setDocumentsError] = useState(false);
  const [baseForm, setBaseForm] = useState({
    name: "",
    description: "",
    isGlobal: false,
  });
  const [docForm, setDocForm] = useState({ title: "", content: "" });
  const [query, setQuery] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingBase, setEditingBase] = useState<KnowledgeBase | null>(null);
  const [editBaseForm, setEditBaseForm] = useState({
    name: "",
    description: "",
    isGlobal: false,
    customizeRag: false,
    ragConfig: null as RagConfig | null,
  });
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachAgents, setAttachAgents] = useState<KnowledgeAgent[]>([]);
  const [loadingAttachAgents, setLoadingAttachAgents] = useState(false);
  const [attachAgentsError, setAttachAgentsError] = useState(false);
  const [attachingAgentId, setAttachingAgentId] = useState<string | null>(null);
  const [canManageKnowledgeBases, setCanManageKnowledgeBases] = useState(false);
  const [canManageTenantGlobals, setCanManageTenantGlobals] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: "base"; id: string; name: string }
    | { kind: "document"; id: string; name: string }
    | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  const loadBases = useCallback(async () => {
    if (!workspaceId) return;
    const res = await fetch(
      `/api/workspace/knowledge-bases?workspaceId=${workspaceId}`,
    );
    if (!res.ok) throw new Error("Failed to load knowledge bases");
    const data = (await res.json()) as KnowledgeBase[];
    setBases(data);
    setSelectedId((current) =>
      current && data.some((base) => base.id === current)
        ? current
        : (data[0]?.id ?? null),
    );
  }, [workspaceId]);

  const loadDocuments = useCallback(async () => {
    if (!workspaceId || !selectedId) {
      setDocuments([]);
      return;
    }
    const res = await fetch(
      `/api/workspace/knowledge-bases/${selectedId}/documents?workspaceId=${workspaceId}`,
    );
    if (!res.ok) throw new Error("Failed to load documents");
    setDocuments(await res.json());
  }, [workspaceId, selectedId]);

  async function openAttachDialog() {
    const canAttachKnowledgeBase = Boolean(
      selectedBaseCanEdit && workspaceId && selectedId,
    );
    if (!canAttachKnowledgeBase) return;
    setAttachOpen(true);
    setLoadingAttachAgents(true);
    setAttachAgentsError(false);
    try {
      const res = await fetch(
        `/api/workspace/agents?workspaceId=${workspaceId}&includeModelMeta=true`,
      );
      if (!res.ok) throw new Error(t("errorLoadAgents"));
      const data = (await res.json()) as
        { agents?: KnowledgeAgent[] } | KnowledgeAgent[];
      setAttachAgents(Array.isArray(data) ? data : (data.agents ?? []));
    } catch (error) {
      setAttachAgentsError(true);
      toast.error(
        error instanceof Error ? error.message : t("errorLoadAgents"),
      );
      return;
    } finally {
      setLoadingAttachAgents(false);
    }
  }

  async function attachBaseToAgent(agentId: string) {
    const canAttachKnowledgeBase = Boolean(
      selectedBaseCanEdit && workspaceId && selectedId,
    );
    if (!canAttachKnowledgeBase) return;
    setAttachingAgentId(agentId);
    try {
      const targetAgent = attachAgents.find((agent) => agent.id === agentId);
      if (!targetAgent) throw new Error(t("errorAttachAgent"));
      const bindingsRes = await fetch(
        `/api/workspace/agents/${agentId}/knowledge?workspaceId=${workspaceId}`,
      );
      if (!bindingsRes.ok) throw new Error(t("errorAttachAgent"));
      const currentBindings =
        (
          (await bindingsRes.json()) as {
            bindings?: Array<{ knowledgeBaseId: string }>;
          }
        ).bindings ?? [];
      const knowledgeBaseIds = Array.from(
        new Set([
          ...currentBindings.map((binding) => binding.knowledgeBaseId),
          selectedId,
        ]),
      );
      const res = await fetch(`/api/workspace/agents/${agentId}/knowledge`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          baseVersionId: targetAgent.activeVersionId,
          knowledgeBaseIds,
        }),
      });
      if (!res.ok) throw new Error(t("errorAttachAgent"));
      toast.success(t("toastAttachedAgent"));
      setAttachOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("errorAttachAgent"),
      );
      return;
    } finally {
      setAttachingAgentId(null);
    }
  }

  async function ingestFromContent(title: string, content: string) {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    const canIngestContent = Boolean(
      selectedBaseCanEdit &&
      workspaceId &&
      selectedId &&
      trimmedTitle &&
      trimmedContent,
    );
    if (!canIngestContent) return;
    const res = await fetch(
      `/api/workspace/knowledge-bases/${selectedId}/documents`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          title: trimmedTitle,
          content,
        }),
      },
    );
    if (!res.ok) return toast.error(t("errorIngest"));
    setDocForm({ title: "", content: "" });
    await loadDocuments();
    toast.success(t("toastDocumentQueued"));
  }

  function handleFileDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files[0];
    if (!selectedBaseCanEdit || !file) return;
    void file.text().then((content) => {
      void ingestFromContent(file.name, content);
    });
  }

  function ingestSelectedFile(file: File | undefined) {
    if (!selectedBaseCanEdit || !file) return;
    void file.text().then((content) => {
      void ingestFromContent(file.name, content);
    });
  }

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    async function run() {
      try {
        setLoadError(false);
        const permissions = await fetchWorkspacePermissions(workspaceId!);
        if (!cancelled) {
          setCanManageKnowledgeBases(permissions.canManageKnowledgeBases);
          setCanManageTenantGlobals(permissions.canManageTenantGlobals);
        }
        await loadBases();
      } catch {
        if (!cancelled) setLoadError(true);
        return;
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [loadBases, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !selectedId) return;
    let cancelled = false;
    async function run() {
      try {
        setDocumentsError(false);
        await loadDocuments();
      } catch {
        if (!cancelled) setDocumentsError(true);
        return;
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [loadDocuments, selectedId, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !selectedId) return;
    const hasProcessing = documents.some((doc) => doc.status === "processing");
    if (!hasProcessing) return;

    const interval = window.setInterval(() => {
      void loadDocuments().catch(() => {});
    }, 3_000);

    return () => window.clearInterval(interval);
  }, [documents, loadDocuments, selectedId, workspaceId]);

  async function createBase() {
    const hasBaseName = Boolean(baseForm.name.trim());
    const canCreateBase = Boolean(canManageKnowledgeBases && workspaceId);
    if (!canCreateBase || !hasBaseName) return;
    try {
      const res = await fetch("/api/workspace/knowledge-bases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name: baseForm.name.trim(),
          description: baseForm.description.trim() || undefined,
          isGlobal: canManageTenantGlobals ? baseForm.isGlobal : undefined,
        }),
      });
      if (!res.ok) return toast.error(t("errorCreate"));
      const created = (await res.json()) as KnowledgeBase;
      setBaseForm({ name: "", description: "", isGlobal: false });
      setShowCreateDialog(false);
      setSelectedId(created.id);
      await loadBases();
      toast.success(t("toastBaseCreated"));
    } catch {
      toast.error(t("errorCreate"));
      return;
    }
  }

  async function ingestDocument() {
    await ingestFromContent(docForm.title, docForm.content);
  }

  async function search() {
    const hasSearchQuery = Boolean(query.trim());
    const canSearchKnowledge = Boolean(workspaceId && selectedId);
    if (!canSearchKnowledge || !hasSearchQuery) return;
    const res = await fetch(
      `/api/workspace/knowledge-bases/${selectedId}/search`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, query }),
      },
    );
    if (!res.ok) return toast.error(t("errorSearch"));
    setResults(await res.json());
  }

  async function updateBase() {
    if (!canManageKnowledgeBases) return;
    if (!workspaceId) return;
    if (!editingBase?.canEdit) return;
    try {
      const res = await fetch(
        `/api/workspace/knowledge-bases/${editingBase.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            name: editBaseForm.name.trim(),
            description: editBaseForm.description.trim() || undefined,
            isGlobal: canManageTenantGlobals
              ? editBaseForm.isGlobal
              : undefined,
            ragConfig: editBaseForm.customizeRag
              ? editBaseForm.ragConfig
              : null,
          }),
        },
      );
      if (!res.ok) return toast.error(t("errorUpdate"));
      setEditingBase(null);
      await loadBases();
      toast.success(t("toastBaseUpdated"));
    } catch {
      toast.error(t("errorUpdate"));
      return;
    }
  }

  async function deleteBase(baseId: string) {
    if (!workspaceId) return;
    const base = bases.find((item) => item.id === baseId);
    if (!canManageKnowledgeBases || !base?.canEdit) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/workspace/knowledge-bases/${baseId}?workspaceId=${workspaceId}`,
        { method: "DELETE" },
      );
      if (!res.ok) return toast.error(t("errorDeleteBase"));
      setPendingDelete(null);
      await loadBases();
      toast.success(t("toastBaseRemoved"));
    } catch {
      toast.error(t("errorDeleteBase"));
      return;
    } finally {
      setDeleting(false);
    }
  }

  async function deleteDocument(documentId: string) {
    const canDeleteDocument = Boolean(
      selectedBaseCanEdit && workspaceId && selectedId,
    );
    if (!canDeleteDocument) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/workspace/knowledge-bases/${selectedId}/documents/${documentId}?workspaceId=${workspaceId}`,
        { method: "DELETE" },
      );
      if (!res.ok) return toast.error(t("errorDeleteDocument"));
      setPendingDelete(null);
      await loadDocuments();
      toast.success(t("toastDocumentRemoved"));
    } catch {
      toast.error(t("errorDeleteDocument"));
      return;
    } finally {
      setDeleting(false);
    }
  }

  if (workspaceLoading || !workspaceId) {
    return <PageLoading label={tCommon("loading")} />;
  }

  const selectedBase = bases.find((base) => base.id === selectedId) ?? null;
  const selectedBaseCanEdit = Boolean(
    canManageKnowledgeBases && selectedBase?.canEdit,
  );

  if (loadError) {
    return (
      <WorkspacePage
        title={t("orbitTitle")}
        accentTitle={t("orbitAccent")}
        eyebrow={t("orbitEyebrow")}
        description={t("orbitDescription")}
        width="wide"
      >
        <div
          className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5"
          role="alert"
        >
          <h2 className="text-base font-semibold">{t("loadErrorTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("loadErrorDescription")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => window.location.reload()}
          >
            {t("retry")}
          </Button>
        </div>
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage
      title={t("orbitTitle")}
      accentTitle={t("orbitAccent")}
      eyebrow={t("orbitEyebrow")}
      description={t("orbitDescription")}
      width="wide"
      actions={
        canManageKnowledgeBases && !loading && bases.length > 0 ? (
          <Button
            type="button"
            size="sm"
            onClick={() => setShowCreateDialog(true)}
          >
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            {t("newBase")}
          </Button>
        ) : null
      }
    >
      <Dialog
        open={canManageKnowledgeBases && showCreateDialog}
        onOpenChange={setShowCreateDialog}
      >
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("createBaseTitle")}</DialogTitle>
            <DialogDescription>{t("createBaseDescription")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Label htmlFor="knowledge-name">{t("name")}</Label>
            <Input
              id="knowledge-name"
              name="knowledge-name"
              autoComplete="off"
              value={baseForm.name}
              onChange={(e) =>
                setBaseForm({ ...baseForm, name: e.target.value })
              }
            />
            <Label htmlFor="knowledge-description">
              {t("descriptionLabel")}
            </Label>
            <Input
              id="knowledge-description"
              name="knowledge-description"
              autoComplete="off"
              value={baseForm.description}
              onChange={(e) =>
                setBaseForm({ ...baseForm, description: e.target.value })
              }
            />
            {canManageTenantGlobals ? (
              <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                <Checkbox
                  id="knowledge-global"
                  checked={baseForm.isGlobal}
                  onCheckedChange={(checked) =>
                    setBaseForm({ ...baseForm, isGlobal: checked === true })
                  }
                />
                <div className="grid gap-1.5 leading-none">
                  <Label htmlFor="knowledge-global">{t("globalLabel")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t("globalDescription")}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              onClick={() => void createBase()}
              disabled={!baseForm.name.trim()}
            >
              {tCommon("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {loading ? (
        <PageLoading label={tCommon("loading")} />
      ) : bases.length === 0 ? (
        <div className="grid min-h-[22rem] gap-3 lg:grid-cols-[16rem_1fr]">
          <aside className="overflow-hidden rounded-2xl border border-border/70 bg-card/55 p-3">
            <div className="flex items-center justify-between px-2 py-2">
              <p className="text-sm font-semibold">{t("basesTitle")}</p>
              <span className="text-xs text-muted-foreground">
                {t("basesCount", { count: 0 })}
              </span>
            </div>
            <div className="mt-2 rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-xs leading-5 text-muted-foreground">
              {t("emptyTitle")}
            </div>
          </aside>
          <section className="flex min-h-[22rem] flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/55 p-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/8 text-primary">
              <BookOpenIcon className="size-5" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-lg font-semibold tracking-[-0.03em]">
              {t("emptyTitle")}
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              {t("emptyBasesDescription")}
            </p>
            {canManageKnowledgeBases ? (
              <Button
                type="button"
                size="sm"
                className="mt-5"
                onClick={() => setShowCreateDialog(true)}
              >
                <PlusIcon data-icon="inline-start" aria-hidden="true" />
                {t("createBaseCta")}
              </Button>
            ) : null}
          </section>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[16rem_1fr]">
          <aside className="overflow-hidden rounded-2xl border border-border/70 bg-card/55 p-2.5">
            <div className="flex items-center justify-between px-2 py-2.5">
              <p className="text-sm font-semibold">{t("basesTitle")}</p>
              <span className="text-[0.7rem] text-muted-foreground">
                {t("basesCount", { count: bases.length })}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {bases.map((base) => (
                <div
                  key={base.id}
                  className={cn(
                    "group flex items-center gap-2 rounded-xl border border-transparent p-2 transition-colors",
                    selectedId === base.id
                      ? "border-primary/15 bg-primary/6"
                      : "hover:bg-muted/45",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(base.id)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 border-0 bg-transparent p-0 text-left text-sm shadow-none outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 font-mono text-[0.62rem] font-medium uppercase text-primary">
                      {base.name
                        .split(/\s+/)
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium">
                        {base.name}
                      </span>
                      <span className="mt-1 block truncate text-[0.68rem] text-muted-foreground">
                        {base.isGlobal ? t("scopeGlobal") : t("scopePrivate")}
                      </span>
                    </span>
                  </button>
                  {canManageKnowledgeBases ? (
                    <div className="flex shrink-0 gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t("editAria", { name: base.name })}
                        disabled={!base.canEdit}
                        onClick={() => {
                          setEditingBase(base);
                          setEditBaseForm({
                            name: base.name,
                            description: base.description ?? "",
                            isGlobal: base.isGlobal,
                            customizeRag: !base.usesDefaultRagConfig,
                            ragConfig: base.effectiveRagConfig,
                          });
                        }}
                      >
                        <PencilIcon aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t("deleteAria", { name: base.name })}
                        disabled={!base.canEdit}
                        onClick={() =>
                          setPendingDelete({
                            kind: "base",
                            id: base.id,
                            name: base.name,
                          })
                        }
                      >
                        <Trash2Icon aria-hidden="true" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </aside>
          <section className="min-w-0">
            {!selectedId ? (
              <PageEmptyState
                icon={BookOpenIcon}
                title={t("selectBaseTitle")}
                description={t("selectBaseDescription")}
              />
            ) : (
              <>
                <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/55">
                  <header className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="min-w-0">
                          <p className="workspace-page-kicker text-[0.58rem]">
                            {selectedBase?.isGlobal
                              ? t("scopeGlobal")
                              : t("scopePrivate")}
                          </p>
                          <h2 className="mt-1 truncate text-lg font-semibold tracking-[-0.03em]">
                            {selectedBase?.name ?? t("documents")}
                          </h2>
                        </div>
                        {selectedBase ? (
                          <ResourceProvenanceBadge
                            provenance={selectedBase.provenance}
                          />
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {selectedBase?.description || t("documentsHint")}
                      </p>
                    </div>
                    {selectedBaseCanEdit ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void openAttachDialog()}
                      >
                        {t("attachAssistant")}
                      </Button>
                    ) : null}
                  </header>

                  {selectedBaseCanEdit ? (
                    <div className="p-3">
                      <input
                        ref={documentInputRef}
                        type="file"
                        accept=".txt,.md,.csv,.json,text/*"
                        className="hidden"
                        onChange={(event) => {
                          ingestSelectedFile(event.target.files?.[0]);
                          event.target.value = "";
                        }}
                      />
                      <div
                        className={cn(
                          "flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed px-5 py-5 text-center transition-colors",
                          dragActive
                            ? "border-primary bg-primary/6"
                            : "border-primary/20 bg-primary/[0.025]",
                        )}
                        onDragOver={(event) => {
                          event.preventDefault();
                          setDragActive(true);
                        }}
                        onDragLeave={() => setDragActive(false)}
                        onDrop={handleFileDrop}
                      >
                        <UploadIcon
                          className="size-5 text-primary"
                          aria-hidden="true"
                        />
                        <p className="mt-2 text-xs font-semibold">
                          {t("dropTitle")}
                        </p>
                        <p className="mt-1 text-[0.7rem] text-muted-foreground">
                          {t("dropFormats")}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-3 h-8"
                          onClick={() => documentInputRef.current?.click()}
                        >
                          {t("browse")}
                        </Button>
                      </div>
                      <AdvancedSection
                        label={t("pasteContent")}
                        hint={t("pasteContentHint")}
                        storageKey="advanced:knowledge-paste-content"
                        className="mt-3"
                      >
                        <div className="grid gap-3">
                          <Input
                            aria-label={t("documentTitle")}
                            name="document-title"
                            autoComplete="off"
                            placeholder={t("documentTitlePlaceholder")}
                            value={docForm.title}
                            onChange={(e) =>
                              setDocForm({ ...docForm, title: e.target.value })
                            }
                          />
                          <Textarea
                            aria-label={t("documentContent")}
                            name="document-content"
                            autoComplete="off"
                            className="min-h-32"
                            placeholder={t("documentContentPlaceholder")}
                            value={docForm.content}
                            onChange={(e) =>
                              setDocForm({
                                ...docForm,
                                content: e.target.value,
                              })
                            }
                          />
                          <Button
                            className="justify-self-end"
                            onClick={() => void ingestDocument()}
                            disabled={
                              !docForm.title.trim() || !docForm.content.trim()
                            }
                          >
                            {t("ingestDocument")}
                          </Button>
                        </div>
                      </AdvancedSection>
                    </div>
                  ) : null}

                  <div className="grid gap-1.5 border-t border-border/55 p-3">
                    {documentsError ? (
                      <div
                        className="rounded-xl border border-destructive/25 bg-destructive/5 p-4"
                        role="alert"
                      >
                        <p className="text-sm font-medium">
                          {t("documentsLoadError")}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          onClick={() => {
                            setDocumentsError(false);
                            void loadDocuments().catch(() =>
                              setDocumentsError(true),
                            );
                          }}
                        >
                          {t("retry")}
                        </Button>
                      </div>
                    ) : null}
                    {!documentsError && documents.length === 0 ? (
                      <p className="rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">
                        {t("documentsEmpty")}
                      </p>
                    ) : null}
                    {documents.map((doc) => (
                      <article
                        key={doc.id}
                        className="flex min-h-14 items-center gap-3 rounded-xl border border-border/65 bg-background/45 p-2"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 font-mono text-[0.58rem] text-primary">
                          <FileTextIcon className="size-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">
                            {doc.title}
                          </p>
                          <p className="mt-1 text-[0.68rem] text-muted-foreground">
                            {new Date(doc.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge
                            variant={statusVariant(doc.status)}
                            className="text-[0.65rem]"
                          >
                            {statusLabel(doc.status, t)}
                          </Badge>
                          {selectedBaseCanEdit ? (
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              aria-label={t("deleteAria", { name: doc.title })}
                              onClick={() =>
                                setPendingDelete({
                                  kind: "document",
                                  id: doc.id,
                                  name: doc.title,
                                })
                              }
                            >
                              <Trash2Icon aria-hidden="true" />
                            </Button>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
                <AdvancedSection
                  label={t("optionalSearch")}
                  hint={t("optionalSearchHint")}
                  storageKey="advanced:knowledge-search"
                >
                  <div className="grid gap-3">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        aria-label={t("searchAriaLabel")}
                        name="knowledge-search"
                        autoComplete="off"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t("searchPlaceholder")}
                      />
                      <Button onClick={() => void search()}>
                        <SearchIcon
                          data-icon="inline-start"
                          aria-hidden="true"
                        />
                        {t("search")}
                      </Button>
                    </div>
                    {results.map((result) => (
                      <div
                        key={result.chunkId}
                        className="rounded-xl border p-3 text-sm"
                      >
                        <p className="font-medium">{result.documentTitle}</p>
                        <p className="mt-1 line-clamp-4 text-muted-foreground">
                          {result.content}
                        </p>
                      </div>
                    ))}
                  </div>
                </AdvancedSection>
              </>
            )}
          </section>
          <Dialog
            open={Boolean(editingBase?.canEdit) && canManageKnowledgeBases}
            onOpenChange={() => setEditingBase(null)}
          >
            <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("editBaseTitle")}</DialogTitle>
                <DialogDescription>
                  {t("editBaseDescription")}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <Label htmlFor="edit-knowledge-name">{t("name")}</Label>
                <Input
                  id="edit-knowledge-name"
                  name="edit-knowledge-name"
                  autoComplete="off"
                  value={editBaseForm.name}
                  onChange={(e) =>
                    setEditBaseForm({ ...editBaseForm, name: e.target.value })
                  }
                />
                <Label htmlFor="edit-knowledge-description">
                  {t("descriptionLabel")}
                </Label>
                <Input
                  id="edit-knowledge-description"
                  name="edit-knowledge-description"
                  autoComplete="off"
                  value={editBaseForm.description}
                  onChange={(e) =>
                    setEditBaseForm({
                      ...editBaseForm,
                      description: e.target.value,
                    })
                  }
                />
                {canManageTenantGlobals ? (
                  <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                    <Checkbox
                      id="edit-knowledge-global"
                      checked={editBaseForm.isGlobal}
                      onCheckedChange={(checked) =>
                        setEditBaseForm({
                          ...editBaseForm,
                          isGlobal: checked === true,
                        })
                      }
                    />
                    <div className="grid gap-1.5 leading-none">
                      <Label htmlFor="edit-knowledge-global">
                        {t("globalLabel")}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t("globalDescription")}
                      </p>
                    </div>
                  </div>
                ) : null}
                <AdvancedSection
                  label={t("ragAdvanced")}
                  hint={t("ragAdvancedHint")}
                  storageKey="advanced:knowledge-rag-config"
                >
                  <div className="grid gap-4">
                    <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
                      <Checkbox
                        id="edit-knowledge-custom-rag"
                        checked={editBaseForm.customizeRag}
                        onCheckedChange={(checked) =>
                          setEditBaseForm({
                            ...editBaseForm,
                            customizeRag: checked === true,
                          })
                        }
                      />
                      <div className="grid gap-1.5">
                        <Label htmlFor="edit-knowledge-custom-rag">
                          {t("ragCustomLabel")}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {t("ragCustomHint")}
                        </p>
                      </div>
                    </div>
                    {editBaseForm.customizeRag && editBaseForm.ragConfig ? (
                      <div className="grid gap-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="grid gap-1.5">
                            <Label htmlFor="edit-rag-embedding-model">
                              {t("ragEmbeddingModel")}
                            </Label>
                            <Input
                              id="edit-rag-embedding-model"
                              value={editBaseForm.ragConfig.embedding.modelId}
                              onChange={(event) =>
                                setEditBaseForm({
                                  ...editBaseForm,
                                  ragConfig: {
                                    ...editBaseForm.ragConfig!,
                                    embedding: {
                                      ...editBaseForm.ragConfig!.embedding,
                                      modelId: event.target.value,
                                    },
                                  },
                                })
                              }
                            />
                          </div>
                          <div className="grid gap-1.5">
                            <Label htmlFor="edit-rag-provider">
                              {t("ragProvider")}
                            </Label>
                            <Input
                              id="edit-rag-provider"
                              value={
                                editBaseForm.ragConfig.embedding.providerId ??
                                ""
                              }
                              onChange={(event) =>
                                setEditBaseForm({
                                  ...editBaseForm,
                                  ragConfig: {
                                    ...editBaseForm.ragConfig!,
                                    embedding: {
                                      ...editBaseForm.ragConfig!.embedding,
                                      providerId: event.target.value || null,
                                    },
                                  },
                                })
                              }
                              placeholder={t("ragAutoProvider")}
                            />
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          {(
                            [
                              [
                                "ragChunkSize",
                                "maxCharacters",
                                editBaseForm.ragConfig.chunking.maxCharacters,
                              ],
                              [
                                "ragChunkOverlap",
                                "overlapCharacters",
                                editBaseForm.ragConfig.chunking
                                  .overlapCharacters,
                              ],
                              [
                                "ragCandidates",
                                "candidateCount",
                                editBaseForm.ragConfig.retrieval.candidateCount,
                              ],
                              [
                                "ragResults",
                                "resultCount",
                                editBaseForm.ragConfig.retrieval.resultCount,
                              ],
                            ] as const
                          ).map(([label, key, value]) => (
                            <div className="grid gap-1.5" key={key}>
                              <Label htmlFor={`edit-rag-${key}`}>
                                {t(label)}
                              </Label>
                              <Input
                                id={`edit-rag-${key}`}
                                type="number"
                                value={value}
                                onChange={(event) => {
                                  const next = Number(event.target.value);
                                  if (!Number.isFinite(next)) return;
                                  const ragConfig = editBaseForm.ragConfig!;
                                  setEditBaseForm({
                                    ...editBaseForm,
                                    ragConfig:
                                      key === "maxCharacters" ||
                                      key === "overlapCharacters"
                                        ? {
                                            ...ragConfig,
                                            chunking: {
                                              ...ragConfig.chunking,
                                              [key]: next,
                                            },
                                          }
                                        : {
                                            ...ragConfig,
                                            retrieval: {
                                              ...ragConfig.retrieval,
                                              [key]: next,
                                            },
                                          },
                                  });
                                }}
                              />
                            </div>
                          ))}
                        </div>
                        <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[auto_1fr] sm:items-end">
                          <div className="flex items-center gap-2 pb-2">
                            <Checkbox
                              id="edit-rag-reranking"
                              checked={editBaseForm.ragConfig.reranking.enabled}
                              onCheckedChange={(checked) => {
                                const ragConfig = editBaseForm.ragConfig!;
                                setEditBaseForm({
                                  ...editBaseForm,
                                  ragConfig: {
                                    ...ragConfig,
                                    reranking: {
                                      ...ragConfig.reranking,
                                      enabled: checked === true,
                                    },
                                  },
                                });
                              }}
                            />
                            <Label htmlFor="edit-rag-reranking">
                              {t("ragReranking")}
                            </Label>
                          </div>
                          <div className="grid gap-1.5">
                            <Label htmlFor="edit-rag-reranking-model">
                              {t("ragRerankingModel")}
                            </Label>
                            <Input
                              id="edit-rag-reranking-model"
                              disabled={
                                !editBaseForm.ragConfig.reranking.enabled
                              }
                              value={editBaseForm.ragConfig.reranking.modelId}
                              onChange={(event) => {
                                const ragConfig = editBaseForm.ragConfig!;
                                setEditBaseForm({
                                  ...editBaseForm,
                                  ragConfig: {
                                    ...ragConfig,
                                    reranking: {
                                      ...ragConfig.reranking,
                                      modelId: event.target.value,
                                    },
                                  },
                                });
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </AdvancedSection>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingBase(null)}>
                  {tCommon("cancel")}
                </Button>
                <Button
                  onClick={() => void updateBase()}
                  disabled={!editingBase?.canEdit || !editBaseForm.name.trim()}
                >
                  {tCommon("save")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog
            open={selectedBaseCanEdit && attachOpen}
            onOpenChange={setAttachOpen}
          >
            <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("attachDialogTitle")}</DialogTitle>
                <DialogDescription>
                  {t("attachDialogDescription")}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                {loadingAttachAgents ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2
                      className="size-5 animate-spin text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                ) : attachAgentsError ? (
                  <div className="py-6 text-center" role="alert">
                    <p className="text-sm text-muted-foreground">
                      {t("errorLoadAgents")}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => void openAttachDialog()}
                    >
                      {t("retry")}
                    </Button>
                  </div>
                ) : attachAgents.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {t("noAttachAgents")}
                  </p>
                ) : (
                  attachAgents.map((agent) => {
                    const canAttach = Boolean(
                      agent.canEdit && agent.activeVersionId,
                    );
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        disabled={!canAttach || attachingAgentId !== null}
                        className="flex items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => void attachBaseToAgent(agent.id)}
                      >
                        <ModelLogo
                          logoUrl={agent.logoUrl}
                          label={agent.name}
                          size="md"
                          imageFit="cover"
                          className="rounded-full"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {agent.name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {agent.modelDisplayName || t("agentNeedsModel")}
                          </span>
                        </span>
                        {attachingAgentId === agent.id ? (
                          <Loader2
                            className="size-4 animate-spin"
                            aria-hidden="true"
                          />
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAttachOpen(false)}>
                  {tCommon("cancel")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.kind === "document"
                ? t("confirmDeleteDocument")
                : t("confirmDeleteBase")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.kind === "document"
                ? t("deleteDocumentDescription", {
                    name: pendingDelete?.name ?? "",
                  })
                : t("deleteBaseDescription", {
                    name: pendingDelete?.name ?? "",
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {tCommon("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting || !pendingDelete}
              onClick={(event) => {
                event.preventDefault();
                if (!pendingDelete) return;
                if (pendingDelete.kind === "document") {
                  void deleteDocument(pendingDelete.id);
                } else {
                  void deleteBase(pendingDelete.id);
                }
              }}
            >
              {deleting ? t("deleting") : tCommon("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WorkspacePage>
  );
}
