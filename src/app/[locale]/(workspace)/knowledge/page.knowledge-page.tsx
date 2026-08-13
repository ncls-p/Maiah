"use client";

import { PageLoading } from "@/components/page-loading";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchWorkspacePermissions } from "@/lib/api-client";
import type {
  ResourceAccessOptions,
  ResourceAccessScope,
  ResourceAccessSelection,
} from "@/modules/iam/resource-access-scope";
import {
  DEFAULT_RAG_CONFIG,
  type RagConfig,
} from "@/modules/knowledge/rag-config-schema";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DocumentRow,
  KnowledgeBase,
  RagModelOption,
  SearchResult,
  cloneRagConfig,
} from "./page.knowledge-base";
import { KnowledgeLoadError } from "./page.knowledge-load-error";
import { KnowledgePageView } from "./page.knowledge-page.view";
import { useKnowledgeAgentAttachment } from "./page.use-agent-attachment";
import { useKnowledgeDocumentActions } from "./page.use-document-actions";
import { useKnowledgeDocumentIngestion } from "./page.use-document-ingestion";

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
