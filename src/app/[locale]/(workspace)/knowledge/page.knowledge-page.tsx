"use client";
import { PageLoading } from "@/components/page-loading";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchWorkspacePermissions } from "@/lib/api-client";
import { ResourceAccessOptions, ResourceAccessScope, ResourceAccessSelection } from "@/modules/iam/resource-access-scope";
import { DEFAULT_RAG_CONFIG, type RagConfig } from "@/modules/knowledge/rag-config-schema";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { DocumentRow, KnowledgeBase, RagModelOption, SearchResult, cloneRagConfig } from "./page.knowledge-base";
import { KnowledgeLoadError } from "./page.knowledge-load-error";
import { useKnowledgeAgentAttachment } from "./page.use-agent-attachment";
import { useKnowledgeDocumentActions } from "./page.use-document-actions";
import { useKnowledgeDocumentIngestion } from "./page.use-document-ingestion";
import { ResourceAccessDialog } from "@/components/resource-access-dialog";
import { AdvancedSection } from "@/components/ui/advanced-section";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WorkspacePage } from "@/components/workspace-page";
import { ModelLogo } from "@/components/providers/model-logo";
import { Loader2, ChevronLeftIcon, ChevronRightIcon, EyeIcon, FileTextIcon, RefreshCwIcon, RotateCcwIcon, SearchIcon, Trash2Icon, UploadIcon, BookOpenIcon, PencilIcon, Share2Icon, PlusIcon } from "lucide-react";
import { RagConfigFields } from "./page.rag-config-fields";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { statusLabel, statusVariant } from "./page.status-variant";
import { Textarea } from "@/components/ui/textarea";
import { ResourceProvenanceBadge } from "@/components/resource-provenance-badge";
import { PageEmptyState } from "@/components/page-empty-state";
import { ResourceAccessScopePicker } from "@/components/agent-access-scope-picker";

export function useKnowledgePageController() {
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
  const [documentFilter, setDocumentFilter] = useState<
    "all" | "ready" | "processing" | "failed"
  >("all");
  const [documentSearch, setDocumentSearch] = useState("");
  const [debouncedDocumentSearch, setDebouncedDocumentSearch] = useState("");
  const [documentPage, setDocumentPage] = useState(1);
  const [documentFilteredCount, setDocumentFilteredCount] = useState(0);
  const [documentCounts, setDocumentCounts] = useState({
    ready: 0,
    processing: 0,
    failed: 0,
  });
  const [baseForm, setBaseForm] = useState({
    name: "",
    description: "",
    isGlobal: false,
    accessScope: "private" as ResourceAccessScope,
    accessTeamId: "",
    customizeRag: false,
    ragConfig: cloneRagConfig(DEFAULT_RAG_CONFIG),
  });
  const [defaultRagConfig, setDefaultRagConfig] = useState(() =>
    cloneRagConfig(DEFAULT_RAG_CONFIG),
  );
  const [ragModels, setRagModels] = useState<RagModelOption[]>([]);
  const [discoveringRagModels, setDiscoveringRagModels] = useState(true);
  const [query, setQuery] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingBase, setEditingBase] = useState<KnowledgeBase | null>(null);
  const [accessBase, setAccessBase] = useState<KnowledgeBase | null>(null);
  const [editBaseForm, setEditBaseForm] = useState({
    name: "",
    description: "",
    isGlobal: false,
    customizeRag: false,
    ragConfig: null as RagConfig | null,
  });
  const [resourceAccessOptions, setResourceAccessOptions] =
    useState<ResourceAccessOptions | null>(null);
  const [canManageKnowledgeBases, setCanManageKnowledgeBases] = useState(false);
  const [canManageModels, setCanManageModels] = useState(false);
  const [canManageTenantGlobals, setCanManageTenantGlobals] = useState(false);
  const selectedBase = bases.find((base) => base.id === selectedId) ?? null;
  const selectedBaseCanEdit = Boolean(
    canManageKnowledgeBases && selectedBase?.canEdit,
  );

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

  const loadDefaultRagConfig = useCallback(async () => {
    if (!workspaceId) return;
    const res = await fetch(
      `/api/workspace/knowledge-bases/default-rag-config?workspaceId=${workspaceId}`,
    );
    if (!res.ok) throw new Error("Failed to load default RAG configuration");
    const config = (await res.json()) as RagConfig;
    setDefaultRagConfig(config);
    setBaseForm((current) => ({
      ...current,
      ragConfig: current.customizeRag
        ? current.ragConfig
        : cloneRagConfig(config),
    }));
  }, [workspaceId]);

  const documentsPerPage = 12;

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedDocumentSearch(documentSearch.trim());
    }, 300);
    return () => window.clearTimeout(handle);
  }, [documentSearch]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset pagination when switching collections
    setDocumentPage(1);
  }, [selectedId]);

  const loadDocuments = useCallback(async () => {
    if (!workspaceId || !selectedId) {
      setDocuments([]);
      setDocumentFilteredCount(0);
      setDocumentCounts({ ready: 0, processing: 0, failed: 0 });
      return;
    }
    const params = new URLSearchParams({
      workspaceId,
      limit: String(documentsPerPage),
      offset: String((documentPage - 1) * documentsPerPage),
    });
    if (documentFilter !== "all") params.set("status", documentFilter);
    if (debouncedDocumentSearch) params.set("q", debouncedDocumentSearch);
    const res = await fetch(
      `/api/workspace/knowledge-bases/${selectedId}/documents?${params}`,
    );
    if (!res.ok) throw new Error("Failed to load documents");
    const data = (await res.json()) as {
      documents: DocumentRow[];
      total: number;
      counts: { ready: number; processing: number; failed: number };
    };
    setDocuments(data.documents);
    setDocumentFilteredCount(data.total);
    setDocumentCounts(data.counts);
    const pageCount = Math.max(1, Math.ceil(data.total / documentsPerPage));
    if (documentPage > pageCount) setDocumentPage(pageCount);
  }, [
    workspaceId,
    selectedId,
    documentPage,
    documentFilter,
    debouncedDocumentSearch,
  ]);

  const {
    docForm,
    setDocForm,
    dragActive,
    setDragActive,
    documentInputRef,
    folderInputRef,
    uploadingCount,
    lastUpload,
    ingestFromContent,
    handleFileDrop,
    ingestSelectedFiles,
  } = useKnowledgeDocumentIngestion({
    workspaceId,
    selectedId,
    selectedBaseCanEdit,
    loadDocuments,
  });
  const {
    previewDocument,
    setPreviewDocument,
    previewLoading,
    setPreviewLoading,
    previewError,
    setPreviewError,
    pendingDelete,
    setPendingDelete,
    deleting,
    deleteBase,
    deleteDocument,
    retryDocument,
    reindexDocument,
    reindexAllDocuments,
    reindexAllOpen,
    setReindexAllOpen,
    reindexingAll,
    openDocumentPreview,
  } = useKnowledgeDocumentActions({
    workspaceId,
    selectedId,
    selectedBaseCanEdit,
    canManageKnowledgeBases,
    bases,
    loadBases,
    loadDocuments,
  });

  const {
    attachOpen,
    setAttachOpen,
    attachAgents,
    loadingAttachAgents,
    attachAgentsError,
    attachingAgentId,
    openAttachDialog,
    attachBaseToAgent,
  } = useKnowledgeAgentAttachment({
    workspaceId,
    selectedId,
    selectedBaseCanEdit,
  });

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
          setCanManageModels(permissions.canManageModels);
          setResourceAccessOptions(permissions.resourceAccessOptions ?? null);
        }
        await Promise.all([loadBases(), loadDefaultRagConfig()]);
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
  }, [loadBases, loadDefaultRagConfig, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !canManageModels) return;
    const controller = new AbortController();
    fetch(`/api/workspace/rag-models?workspaceId=${workspaceId}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Model discovery failed");
        return response.json() as Promise<{
          providers: Array<{
            provider: { id: string; name: string };
            models: Array<{
              modelId: string;
              displayName?: string;
              capabilities?: { embeddings?: boolean; vision?: boolean };
            }>;
          }>;
        }>;
      })
      .then((catalog) =>
        setRagModels(
          catalog.providers.flatMap(({ provider, models }) =>
            models.map((model) => ({
              providerId: provider.id,
              providerName: provider.name,
              modelId: model.modelId,
              displayName: model.displayName,
              embeddings: model.capabilities?.embeddings === true,
              vision: model.capabilities?.vision === true,
            })),
          ),
        ),
      )
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setRagModels([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDiscoveringRagModels(false);
      });
    return () => controller.abort();
  }, [canManageModels, workspaceId]);

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
    if (documentCounts.processing === 0) return;

    const interval = window.setInterval(() => {
      void loadDocuments().catch(() => {});
    }, 3_000);

    return () => window.clearInterval(interval);
  }, [documentCounts.processing, loadDocuments, selectedId, workspaceId]);

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
          accessScope: baseForm.accessScope,
          accessTeamId:
            baseForm.accessScope === "team" ? baseForm.accessTeamId : undefined,
          ragConfig: baseForm.customizeRag ? baseForm.ragConfig : undefined,
        }),
      });
      if (!res.ok) return toast.error(t("errorCreate"));
      const created = (await res.json()) as KnowledgeBase;
      setBaseForm({
        name: "",
        description: "",
        isGlobal: false,
        accessScope: "private",
        accessTeamId: "",
        customizeRag: false,
        ragConfig: cloneRagConfig(defaultRagConfig),
      });
      setShowCreateDialog(false);
      await loadBases();
      setSelectedId(created.id);
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

  async function openBaseAccess(base: KnowledgeBase) {
    if (!workspaceId || !base.canEdit) return;
    try {
      const response = await fetch(
        `/api/workspace/knowledge-bases/${base.id}?workspaceId=${workspaceId}`,
      );
      const data = (await response
        .json()
        .catch(() => ({}))) as KnowledgeBase & {
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || t("errorUpdate"));
      setAccessBase(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errorUpdate"));
    }
  }

  async function saveBaseAccess(selection: ResourceAccessSelection) {
    if (!workspaceId || !accessBase) return;
    const response = await fetch(
      `/api/workspace/knowledge-bases/${accessBase.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          accessScope: selection.scope,
          accessTeamId:
            selection.scope === "team" ? selection.teamId : undefined,
        }),
      },
    );
    const data = (await response.json().catch(() => ({}))) as KnowledgeBase & {
      error?: string;
    };
    if (!response.ok) throw new Error(data.error || t("errorUpdate"));
    setAccessBase({ ...accessBase, ...data, access: selection });
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

  if (workspaceLoading || !workspaceId) {
    return <PageLoading label={tCommon("loading")} />;
  }

  const documentTotalCount =
    documentCounts.ready + documentCounts.processing + documentCounts.failed;
  const documentPageCount = Math.max(
    1,
    Math.ceil(documentFilteredCount / documentsPerPage),
  );
  const safeDocumentPage = Math.min(documentPage, documentPageCount);
  const visibleDocuments = documents;

  if (loadError) return <KnowledgeLoadError />;

  return {
    kind: "ready",
    accessBase,
    attachAgents,
    attachAgentsError,
    attachBaseToAgent,
    attachOpen,
    attachingAgentId,
    baseForm,
    bases,
    canManageKnowledgeBases,
    canManageModels,
    canManageTenantGlobals,
    createBase,
    defaultRagConfig,
    deleteBase,
    deleteDocument,
    deleting,
    discoveringRagModels,
    docForm,
    documentCounts,
    documentFilter,
    documentFilteredCount,
    documentInputRef,
    documentPageCount,
    documentSearch,
    documentTotalCount,
    documents,
    documentsError,
    dragActive,
    editBaseForm,
    editingBase,
    folderInputRef,
    handleFileDrop,
    ingestDocument,
    ingestSelectedFiles,
    lastUpload,
    loadBases,
    loadDocuments,
    loading,
    loadingAttachAgents,
    openAttachDialog,
    openBaseAccess,
    openDocumentPreview,
    pendingDelete,
    previewDocument,
    previewError,
    previewLoading,
    query,
    ragModels,
    reindexAllDocuments,
    reindexAllOpen,
    reindexDocument,
    reindexingAll,
    resourceAccessOptions,
    results,
    retryDocument,
    safeDocumentPage,
    saveBaseAccess,
    search,
    selectedBase,
    selectedBaseCanEdit,
    selectedId,
    setAccessBase,
    setAttachOpen,
    setBaseForm,
    setDocForm,
    setDocumentFilter,
    setDocumentPage,
    setDocumentSearch,
    setDocumentsError,
    setDragActive,
    setEditBaseForm,
    setEditingBase,
    setPendingDelete,
    setPreviewDocument,
    setPreviewError,
    setPreviewLoading,
    setQuery,
    setReindexAllOpen,
    setSelectedId,
    setShowCreateDialog,
    showCreateDialog,
    t,
    tCommon,
    updateBase,
    uploadingCount,
    visibleDocuments,
    workspaceId,
  } as const;
}

export default function KnowledgePage(
  ...args: Parameters<typeof useKnowledgePageController>
) {
  const model = useKnowledgePageController(...args);
  if (!("kind" in model)) return model;
  return <KnowledgePageView model={model} />;
}


export type KnowledgePageViewModel = Extract<
  ReturnType<typeof useKnowledgePageController>,
  { kind: "ready" }
>;
export function KnowledgePageView({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const {
    accessBase,
    baseForm,
    bases,
    canManageKnowledgeBases,
    canManageTenantGlobals,
    createBase,
    defaultRagConfig,
    deleteBase,
    deleteDocument,
    deleting,
    loading,
    pendingDelete,
    reindexAllDocuments,
    reindexAllOpen,
    reindexingAll,
    resourceAccessOptions,
    saveBaseAccess,
    selectedBase,
    setAccessBase,
    setBaseForm,
    setPendingDelete,
    setReindexAllOpen,
    setShowCreateDialog,
    showCreateDialog,
    t,
    tCommon,
  } = model;
  return (
    <WorkspacePage
      title={t("orbitTitle")}
      accentTitle={t("orbitAccent")}
      eyebrow={t("orbitEyebrow")}
      description={t("orbitDescription")}
      width="wide"
      actions={
        canManageKnowledgeBases && !loading && bases.length > 0 ? (
          <KnowledgePageBranch6 model={model} />
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
              <KnowledgePageBranch5 model={model} />
            ) : null}
            <AdvancedSection
              label={t("ragAdvanced")}
              hint={t("ragCreateAdvancedHint")}
              storageKey="advanced:knowledge-create-rag-config"
            >
              <div className="grid gap-4">
                <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
                  <Checkbox
                    id="knowledge-custom-rag"
                    checked={baseForm.customizeRag}
                    onCheckedChange={(checked) =>
                      setBaseForm({
                        ...baseForm,
                        customizeRag: checked === true,
                        ragConfig: checked
                          ? cloneRagConfig(baseForm.ragConfig)
                          : cloneRagConfig(defaultRagConfig),
                      })
                    }
                  />
                  <div className="grid gap-1.5">
                    <Label htmlFor="knowledge-custom-rag">
                      {t("ragCustomLabel")}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t("ragCreateCustomHint")}
                    </p>
                  </div>
                </div>
                {baseForm.customizeRag ? (
                  <KnowledgePageBranch4 model={model} />
                ) : null}
              </div>
            </AdvancedSection>
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
        <KnowledgePageBranch3 model={model} />
      ) : bases.length === 0 ? (
        <KnowledgePageBranch2 model={model} />
      ) : (
        <KnowledgePageBranch1 model={model} />
      )}
      {resourceAccessOptions ? (
        <ResourceAccessDialog
          open={accessBase !== null}
          workspaceId={model.workspaceId}
          resource={
            accessBase
              ? {
                  id: accessBase.id,
                  name: accessBase.name,
                  type: "knowledge_base",
                }
              : null
          }
          selection={accessBase?.access ?? { scope: "private" }}
          options={resourceAccessOptions}
          onOpenChangeAction={(open) => {
            if (!open) setAccessBase(null);
          }}
          onScopeSaveAction={saveBaseAccess}
          onSavedAction={model.loadBases}
        />
      ) : null}
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
      <AlertDialog
        open={reindexAllOpen}
        onOpenChange={(open) => {
          if (!open && !reindexingAll) setReindexAllOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("reindexAllConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("reindexAllConfirmDescription", {
                name: selectedBase?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reindexingAll}>
              {tCommon("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={reindexingAll}
              onClick={(event) => {
                event.preventDefault();
                void reindexAllDocuments();
              }}
            >
              {t("reindexAll")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WorkspacePage>
  );
}


export function KnowledgeMainSection1({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const {
    attachAgents,
    attachAgentsError,
    attachBaseToAgent,
    attachOpen,
    attachingAgentId,
    loadingAttachAgents,
    openAttachDialog,
    selectedBaseCanEdit,
    setAttachOpen,
    t,
    tCommon,
  } = model;
  return (
    <Dialog
      open={selectedBaseCanEdit && attachOpen}
      onOpenChange={setAttachOpen}
    >
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("attachDialogTitle")}</DialogTitle>
          <DialogDescription>{t("attachDialogDescription")}</DialogDescription>
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
              const canAttach = Boolean(agent.canEdit && agent.activeVersionId);
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
  );
}


export function KnowledgeMainSection2({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const {
    canManageKnowledgeBases,
    canManageModels,
    canManageTenantGlobals,
    discoveringRagModels,
    editBaseForm,
    editingBase,
    ragModels,
    setEditBaseForm,
    setEditingBase,
    t,
    tCommon,
    updateBase,
  } = model;
  return (
    <Dialog
      open={Boolean(editingBase?.canEdit) && canManageKnowledgeBases}
      onOpenChange={() => setEditingBase(null)}
    >
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("editBaseTitle")}</DialogTitle>
          <DialogDescription>{t("editBaseDescription")}</DialogDescription>
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
                <RagConfigFields
                  idPrefix="edit-rag"
                  config={editBaseForm.ragConfig}
                  onChange={(ragConfig) =>
                    setEditBaseForm({ ...editBaseForm, ragConfig })
                  }
                  canManageModels={canManageModels}
                  models={ragModels}
                  discoveringModels={discoveringRagModels}
                />
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
  );
}


export function KnowledgeMainSection3({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const {
    previewDocument,
    previewError,
    previewLoading,
    setPreviewDocument,
    setPreviewError,
    setPreviewLoading,
    t,
  } = model;
  return (
    <Dialog
      open={previewLoading || previewError || previewDocument !== null}
      onOpenChange={(open) => {
        if (!open) {
          setPreviewDocument(null);
          setPreviewError(false);
          setPreviewLoading(false);
        }
      }}
    >
      <DialogContent className="flex max-h-[calc(100svh-2rem)] max-w-3xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4 text-left">
          <DialogTitle className="truncate pr-8">
            {previewDocument?.documentTitle ?? t("documentPreviewTitle")}
          </DialogTitle>
          <DialogDescription>
            {previewDocument
              ? previewDocument.originalUrl
                ? t("documentPdfPreviewDescription")
                : t("documentPreviewDescription", {
                    chunks: previewDocument.chunks.length,
                  })
              : t("documentPreviewLoading")}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-4 py-4 sm:px-6">
          {previewLoading ? (
            <div
              className="flex min-h-64 items-center justify-center"
              aria-live="polite"
            >
              <Loader2
                className="size-5 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
              <span className="sr-only">{t("documentPreviewLoading")}</span>
            </div>
          ) : previewError ? (
            <div
              className="flex min-h-64 flex-col items-center justify-center text-center"
              role="alert"
            >
              <p className="text-sm font-medium">{t("documentPreviewError")}</p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                {t("documentPreviewErrorHint")}
              </p>
            </div>
          ) : previewDocument?.originalUrl ? (
            <iframe
              src={previewDocument.originalUrl}
              title={previewDocument.documentTitle}
              className="h-[min(72dvh,58rem)] w-full rounded-xl border bg-background"
            />
          ) : previewDocument ? (
            <article className="mx-auto max-w-2xl space-y-2">
              {previewDocument.chunks.map((chunk) => (
                <section
                  key={chunk.chunkId}
                  data-chunk-index={chunk.chunkIndex}
                  className="rounded-xl border border-border/65 bg-background px-5 py-4 shadow-sm sm:px-6"
                >
                  <p className="mb-2 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-muted-foreground">
                    {t("documentChunk", { number: chunk.chunkIndex + 1 })}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground/90">
                    {chunk.content}
                  </p>
                </section>
              ))}
            </article>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}


export function KnowledgeDocumentTableBranch1({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const {
    documentCounts,
    documentFilter,
    documentFilteredCount,
    documentPageCount,
    documentSearch,
    documentTotalCount,
    openDocumentPreview,
    reindexDocument,
    retryDocument,
    safeDocumentPage,
    selectedBaseCanEdit,
    setDocumentFilter,
    setDocumentPage,
    setDocumentSearch,
    setPendingDelete,
    t,
    visibleDocuments,
  } = model;
  return (
    <>
      <div className="grid gap-3 border-b border-border/55 bg-muted/[0.18] p-3">
        <div className="grid grid-cols-3 gap-2 sm:max-w-md">
          {(["ready", "processing", "failed"] as const).map((status) => (
            <button
              key={status}
              type="button"
              className={cn(
                "rounded-lg border px-2.5 py-2 text-left transition-colors",
                documentFilter === status
                  ? "border-primary/35 bg-primary/8"
                  : "border-border/60 bg-background/60 hover:bg-muted/60",
              )}
              onClick={() => {
                setDocumentPage(1);
                setDocumentFilter((current) =>
                  current === status ? "all" : status,
                );
              }}
              aria-pressed={documentFilter === status}
            >
              <span className="block text-base font-semibold tabular-nums">
                {documentCounts[status]}
              </span>
              <span className="block truncate text-[0.65rem] text-muted-foreground">
                {statusLabel(status, t)}
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <SearchIcon
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              className="h-9 pl-9"
              type="search"
              value={documentSearch}
              onChange={(event) => {
                setDocumentPage(1);
                setDocumentSearch(event.target.value);
              }}
              placeholder={t("documentListSearchPlaceholder")}
              aria-label={t("documentListSearchLabel")}
            />
          </div>
          <p
            className="shrink-0 text-xs text-muted-foreground"
            aria-live="polite"
          >
            {t("documentListCount", {
              visible: documentFilteredCount,
              total: documentTotalCount,
            })}
          </p>
        </div>
      </div>

      {visibleDocuments.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm font-medium">{t("documentsFilteredEmpty")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("documentsFilteredEmptyHint")}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-4"
            onClick={() => {
              setDocumentFilter("all");
              setDocumentSearch("");
            }}
          >
            {t("clearDocumentFilters")}
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-border/55">
          {visibleDocuments.map((doc) => (
            <article
              key={doc.id}
              className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-muted/25 sm:gap-3"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/55 bg-background text-muted-foreground">
                <FileTextIcon className="size-3.5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    className="min-w-0 truncate text-left text-xs font-medium hover:text-primary disabled:cursor-default disabled:hover:text-foreground"
                    disabled={doc.status !== "ready"}
                    onClick={() => void openDocumentPreview(doc.id)}
                  >
                    {doc.title}
                  </button>
                  <span className="hidden shrink-0 text-[0.65rem] text-muted-foreground sm:inline">
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div
                    className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-muted sm:max-w-44"
                    role="progressbar"
                    aria-label={t("documentProgress", {
                      name: doc.title,
                    })}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={doc.processingProgress}
                  >
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-500",
                        doc.status === "failed"
                          ? "bg-destructive"
                          : "bg-primary",
                      )}
                      style={{
                        width: `${doc.processingProgress}%`,
                      }}
                    />
                  </div>
                  <span className="w-8 text-right text-[0.65rem] tabular-nums text-muted-foreground">
                    {doc.processingProgress}%
                  </span>
                  <span className="hidden truncate text-[0.65rem] text-muted-foreground md:inline">
                    {t(`processingStage.${doc.processingStage}`)}
                  </span>
                </div>
                {doc.errorMessage ? (
                  <p
                    className={cn(
                      "mt-1 truncate text-[0.65rem]",
                      doc.status === "ready"
                        ? "text-warning"
                        : "text-destructive",
                    )}
                    title={doc.errorMessage}
                  >
                    {doc.errorMessage}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Badge
                  variant={statusVariant(doc.status)}
                  className="hidden text-[0.62rem] sm:inline-flex"
                >
                  {statusLabel(doc.status, t)}
                </Badge>
                {doc.status === "ready" ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("previewAria", {
                      name: doc.title,
                    })}
                    onClick={() => void openDocumentPreview(doc.id)}
                  >
                    <EyeIcon aria-hidden="true" />
                  </Button>
                ) : null}
                {selectedBaseCanEdit && doc.status === "failed" ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("retryAria", {
                      name: doc.title,
                    })}
                    onClick={() => void retryDocument(doc.id)}
                  >
                    <RefreshCwIcon aria-hidden="true" />
                  </Button>
                ) : null}
                {selectedBaseCanEdit ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={doc.status === "processing"}
                    aria-label={t("reindexAria", {
                      name: doc.title,
                    })}
                    onClick={() => void reindexDocument(doc.id)}
                  >
                    <RotateCcwIcon aria-hidden="true" />
                  </Button>
                ) : null}
                {selectedBaseCanEdit ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("deleteAria", {
                      name: doc.title,
                    })}
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
      )}

      {documentPageCount > 1 ? (
        <div className="flex items-center justify-between border-t border-border/55 px-3 py-2.5">
          <p className="text-xs text-muted-foreground">
            {t("documentPage", {
              page: safeDocumentPage,
              pages: documentPageCount,
            })}
          </p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              disabled={safeDocumentPage <= 1}
              aria-label={t("previousDocumentPage")}
              onClick={() =>
                setDocumentPage((current) => Math.max(1, current - 1))
              }
            >
              <ChevronLeftIcon aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              disabled={safeDocumentPage >= documentPageCount}
              aria-label={t("nextDocumentPage")}
              onClick={() =>
                setDocumentPage((current) =>
                  Math.min(documentPageCount, current + 1),
                )
              }
            >
              <ChevronRightIcon aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}


export function KnowledgeDocumentTableBranch2({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const { t } = model;
  return (
    <p className="m-3 rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">
      {t("documentsEmpty")}
    </p>
  );
}


export function KnowledgeDocumentTableBranch3({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const { loadDocuments, setDocumentsError, t } = model;
  return (
    <div
      className="m-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4"
      role="alert"
    >
      <p className="text-sm font-medium">{t("documentsLoadError")}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={() => {
          setDocumentsError(false);
          void loadDocuments().catch(() => setDocumentsError(true));
        }}
      >
        {t("retry")}
      </Button>
    </div>
  );
}


export function KnowledgeDocumentTableBranch4({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const {
    docForm,
    documentInputRef,
    documentTotalCount,
    dragActive,
    folderInputRef,
    handleFileDrop,
    ingestDocument,
    ingestSelectedFiles,
    lastUpload,
    selectedId,
    setDocForm,
    setDragActive,
    t,
    uploadingCount,
  } = model;
  return (
    <div className="p-3">
      <AdvancedSection
        key={`${selectedId}:${documentTotalCount === 0 ? "empty" : "populated"}`}
        label={t("addDocuments")}
        hint={t("addDocumentsHint")}
        defaultOpen={documentTotalCount === 0}
      >
        <input
          id="knowledge-file-upload"
          ref={documentInputRef}
          type="file"
          multiple
          accept=".txt,.md,.markdown,.csv,.tsv,.json,.jsonl,.pdf,.doc,.docx,.docm,.ppt,.pptx,.pptm,.pps,.ppsx,.ppsm,.pot,.xlsx,.xls,.xlsm,.xlsb,.rtf,.odt,.ods,.odp,.epub,.html,.xml,.yaml,.yml,.png,.jpg,.jpeg,.webp,.gif,.zip,text/*,image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(event) => {
            ingestSelectedFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          id="knowledge-folder-upload"
          ref={(node) => {
            folderInputRef.current = node;
            node?.setAttribute("webkitdirectory", "");
          }}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            ingestSelectedFiles(event.target.files);
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
          <UploadIcon className="size-5 text-primary" aria-hidden="true" />
          <p className="mt-2 text-xs font-semibold">{t("dropTitle")}</p>
          <p className="mt-1 text-[0.7rem] text-muted-foreground">
            {t("dropFormats")}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={uploadingCount > 0}
              onClick={() => documentInputRef.current?.click()}
            >
              {t("browseFiles")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={uploadingCount > 0}
              onClick={() => folderInputRef.current?.click()}
            >
              {t("browseFolder")}
            </Button>
          </div>
        </div>
        {uploadingCount > 0 ? (
          <div className="mt-3 rounded-xl border bg-muted/25 p-3 text-xs">
            <div className="flex items-center gap-2 font-medium">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              {t("extractingBatch", { count: uploadingCount })}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
            </div>
          </div>
        ) : null}
        {lastUpload ? (
          <div className="mt-3 rounded-xl border bg-muted/20 p-3 text-xs">
            <p className="font-medium">
              {t("batchSummary", {
                accepted: lastUpload.accepted,
                rejected: lastUpload.rejected.length,
              })}
            </p>
            {lastUpload.rejected.length > 0 ? (
              <ul className="mt-2 space-y-1 text-destructive">
                {lastUpload.rejected.slice(0, 5).map((item) => (
                  <li key={`${item.title}:${item.error}`}>
                    {item.title}: {item.error}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
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
                setDocForm({
                  ...docForm,
                  title: e.target.value,
                })
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
              disabled={!docForm.title.trim() || !docForm.content.trim()}
            >
              {t("ingestDocument")}
            </Button>
          </div>
        </AdvancedSection>
      </AdvancedSection>
    </div>
  );
}


export function KnowledgeDocumentTableBranch5({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const { documentTotalCount, openAttachDialog, setReindexAllOpen, t } = model;
  return (
    <div className="flex shrink-0 items-center gap-2">
      {documentTotalCount > 0 ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setReindexAllOpen(true)}
        >
          <RotateCcwIcon aria-hidden="true" />
          {t("reindexAll")}
        </Button>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => void openAttachDialog()}
      >
        {t("attachAssistant")}
      </Button>
    </div>
  );
}


export function KnowledgeDocumentTableBranch6({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const { selectedBase } = model;
  return <ResourceProvenanceBadge provenance={selectedBase!.provenance} />;
}


export function KnowledgeDocumentListSection1({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const {
    documentTotalCount,
    documentsError,
    selectedBase,
    selectedBaseCanEdit,
    t,
  } = model;
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/55">
      <header className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0">
              <p className="workspace-page-kicker text-[0.58rem]">
                {selectedBase?.isGlobal ? t("scopeGlobal") : t("scopePrivate")}
              </p>
              <h2 className="mt-1 truncate text-lg font-semibold tracking-[-0.03em]">
                {selectedBase?.name ?? t("documents")}
              </h2>
            </div>
            {selectedBase ? (
              <KnowledgeDocumentTableBranch6 model={model} />
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {selectedBase?.description || t("documentsHint")}
          </p>
        </div>
        {selectedBaseCanEdit ? (
          <KnowledgeDocumentTableBranch5 model={model} />
        ) : null}
      </header>

      {selectedBaseCanEdit ? (
        <KnowledgeDocumentTableBranch4 model={model} />
      ) : null}

      <div className="border-t border-border/55">
        {documentsError ? (
          <KnowledgeDocumentTableBranch3 model={model} />
        ) : null}
        {!documentsError && documentTotalCount === 0 ? (
          <KnowledgeDocumentTableBranch2 model={model} />
        ) : null}
        {!documentsError && documentTotalCount > 0 ? (
          <KnowledgeDocumentTableBranch1 model={model} />
        ) : null}
      </div>
    </div>
  );
}


export function KnowledgeDocumentsBranch1({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const { query, results, search, setQuery, t } = model;
  return (
    <>
      <KnowledgeDocumentListSection1 model={model} />
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
              <SearchIcon data-icon="inline-start" aria-hidden="true" />
              {t("search")}
            </Button>
          </div>
          {results.map((result) => (
            <div key={result.chunkId} className="rounded-xl border p-3 text-sm">
              <p className="font-medium">{result.documentTitle}</p>
              <p className="mt-1 line-clamp-4 text-muted-foreground">
                {result.content}
              </p>
            </div>
          ))}
        </div>
      </AdvancedSection>
    </>
  );
}


export function KnowledgeDocumentsBranch2({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const { t } = model;
  return (
    <PageEmptyState
      icon={BookOpenIcon}
      title={t("selectBaseTitle")}
      description={t("selectBaseDescription")}
    />
  );
}


export function KnowledgeMainSection4({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const { selectedId } = model;
  return (
    <section className="min-w-0">
      {!selectedId ? (
        <KnowledgeDocumentsBranch2 model={model} />
      ) : (
        <KnowledgeDocumentsBranch1 model={model} />
      )}
    </section>
  );
}


export function KnowledgeMainSection5({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const {
    bases,
    canManageKnowledgeBases,
    openBaseAccess,
    selectedId,
    setEditBaseForm,
    setEditingBase,
    setPendingDelete,
    setSelectedId,
    t,
  } = model;
  return (
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
                  aria-label={t("shareAria", { name: base.name })}
                  disabled={!base.canEdit}
                  onClick={() => void openBaseAccess(base)}
                >
                  <Share2Icon aria-hidden="true" />
                </Button>
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
  );
}


export function KnowledgePageBranch1({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const {} = model;
  return (
    <div className="grid gap-3 lg:grid-cols-[16rem_1fr]">
      <KnowledgeMainSection5 model={model} />
      <KnowledgeMainSection4 model={model} />
      <KnowledgeMainSection3 model={model} />
      <KnowledgeMainSection2 model={model} />
      <KnowledgeMainSection1 model={model} />
    </div>
  );
}


export function KnowledgePageBranch2({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const { canManageKnowledgeBases, setShowCreateDialog, t } = model;
  return (
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
  );
}


export function KnowledgePageBranch3({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const { tCommon } = model;
  return <PageLoading label={tCommon("loading")} />;
}


export function KnowledgePageBranch4({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const {
    baseForm,
    canManageModels,
    discoveringRagModels,
    ragModels,
    setBaseForm,
  } = model;
  return (
    <RagConfigFields
      idPrefix="create-rag"
      config={baseForm.ragConfig}
      onChange={(ragConfig) => setBaseForm({ ...baseForm, ragConfig })}
      canManageModels={canManageModels}
      models={ragModels}
      discoveringModels={discoveringRagModels}
    />
  );
}


export function KnowledgePageBranch5({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const { baseForm, resourceAccessOptions, setBaseForm } = model;
  if (!resourceAccessOptions) return null;
  return (
    <ResourceAccessScopePicker
      value={baseForm.accessScope}
      teamId={baseForm.accessTeamId}
      options={resourceAccessOptions}
      copyNamespace="resourceAccessScope"
      onChangeAction={(accessScope, accessTeamId) =>
        setBaseForm({
          ...baseForm,
          accessScope,
          accessTeamId: accessTeamId ?? "",
        })
      }
    />
  );
}


export function KnowledgePageBranch6({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const { setShowCreateDialog, t } = model;
  return (
    <Button type="button" size="sm" onClick={() => setShowCreateDialog(true)}>
      <PlusIcon data-icon="inline-start" aria-hidden="true" />
      {t("newBase")}
    </Button>
  );
}

