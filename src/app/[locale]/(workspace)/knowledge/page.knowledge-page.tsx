"use client";

import { PageLoading } from "@/components/page-loading";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchWorkspacePermissions } from "@/lib/api-client";
import type {
  ResourceAccessOptions,
  ResourceAccessScope,
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
  const [documentPage, setDocumentPage] = useState(1);
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

  const documentCounts = documents.reduce(
    (counts, document) => {
      if (document.status === "ready") counts.ready += 1;
      else if (document.status === "processing") counts.processing += 1;
      else counts.failed += 1;
      return counts;
    },
    { ready: 0, processing: 0, failed: 0 },
  );
  const normalizedDocumentSearch = documentSearch.trim().toLocaleLowerCase();
  const filteredDocuments = documents.filter(
    (document) =>
      (documentFilter === "all" || document.status === documentFilter) &&
      (!normalizedDocumentSearch ||
        document.title.toLocaleLowerCase().includes(normalizedDocumentSearch)),
  );
  const documentsPerPage = 12;
  const documentPageCount = Math.max(
    1,
    Math.ceil(filteredDocuments.length / documentsPerPage),
  );
  const safeDocumentPage = Math.min(documentPage, documentPageCount);
  const visibleDocuments = filteredDocuments.slice(
    (safeDocumentPage - 1) * documentsPerPage,
    safeDocumentPage * documentsPerPage,
  );

  if (loadError) return <KnowledgeLoadError />;

  return {
    kind: "ready",
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
    documentInputRef,
    documentPageCount,
    documentSearch,
    documents,
    documentsError,
    dragActive,
    editBaseForm,
    editingBase,
    filteredDocuments,
    folderInputRef,
    handleFileDrop,
    ingestDocument,
    ingestSelectedFiles,
    lastUpload,
    loadDocuments,
    loading,
    loadingAttachAgents,
    openAttachDialog,
    openDocumentPreview,
    pendingDelete,
    previewDocument,
    previewError,
    previewLoading,
    query,
    ragModels,
    resourceAccessOptions,
    results,
    retryDocument,
    safeDocumentPage,
    search,
    selectedBase,
    selectedBaseCanEdit,
    selectedId,
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
    setSelectedId,
    setShowCreateDialog,
    showCreateDialog,
    t,
    tCommon,
    updateBase,
    uploadingCount,
    visibleDocuments,
  } as const;
}

export default function KnowledgePage(
  ...args: Parameters<typeof useKnowledgePageController>
) {
  const model = useKnowledgePageController(...args);
  if (!("kind" in model)) return model;
  return <KnowledgePageView model={model} />;
}
