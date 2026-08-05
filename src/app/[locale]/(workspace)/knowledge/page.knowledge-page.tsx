"use client";

import { PageEmptyState } from "@/components/page-empty-state";
import { PageLoading } from "@/components/page-loading";
import { ModelLogo } from "@/components/providers/model-logo";
import { ResourceProvenanceBadge } from "@/components/resource-provenance-badge";
import { AdvancedSection } from "@/components/ui/advanced-section";
import { AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogHeader,AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WorkspacePage } from "@/components/workspace-page";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchWorkspacePermissions } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { uploadDocumentInChunks } from "@/modules/document-upload/chunked-upload";
import { DEFAULT_RAG_CONFIG,type RagConfig } from "@/modules/knowledge/rag-config-schema";
import { BookOpenIcon,ChevronLeftIcon,ChevronRightIcon,EyeIcon,FileTextIcon,Loader2,PencilIcon,PlusIcon,RefreshCwIcon,SearchIcon,Trash2Icon,UploadIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback,useEffect,useRef,useState,type DragEvent } from "react";
import { toast } from "sonner";
import { DocumentPreview,DocumentRow,KnowledgeAgent,KnowledgeBase,RagModelOption,SearchResult,cloneRagConfig } from "./page.knowledge-base";
import { RagConfigFields } from "./page.rag-config-fields";
import { statusLabel,statusVariant } from "./page.status-variant";

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
  const [documentFilter, setDocumentFilter] = useState<"all" | "ready" | "processing" | "failed">("all");
  const [documentSearch, setDocumentSearch] = useState("");
  const [documentPage, setDocumentPage] = useState(1);
  const [previewDocument, setPreviewDocument] = useState<DocumentPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [baseForm, setBaseForm] = useState({
    name: "",
    description: "",
    isGlobal: false,
    customizeRag: false,
    ragConfig: cloneRagConfig(DEFAULT_RAG_CONFIG),
  });
  const [defaultRagConfig, setDefaultRagConfig] = useState(() => cloneRagConfig(DEFAULT_RAG_CONFIG));
  const [ragModels, setRagModels] = useState<RagModelOption[]>([]);
  const [discoveringRagModels, setDiscoveringRagModels] = useState(true);
  const [docForm, setDocForm] = useState({ title: "", content: "" });
  const [query, setQuery] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [lastUpload, setLastUpload] = useState<{
    accepted: number;
    rejected: Array<{ title: string; error: string }>;
  } | null>(null);
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
  const [canManageModels, setCanManageModels] = useState(false);
  const [canManageTenantGlobals, setCanManageTenantGlobals] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ kind: "base"; id: string; name: string } | { kind: "document"; id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadBases = useCallback(async () => {
    if (!workspaceId) return;
    const res = await fetch(`/api/workspace/knowledge-bases?workspaceId=${workspaceId}`);
    if (!res.ok) throw new Error("Failed to load knowledge bases");
    const data = (await res.json()) as KnowledgeBase[];
    setBases(data);
    setSelectedId((current) => (current && data.some((base) => base.id === current) ? current : (data[0]?.id ?? null)));
  }, [workspaceId]);

  const loadDefaultRagConfig = useCallback(async () => {
    if (!workspaceId) return;
    const res = await fetch(`/api/workspace/knowledge-bases/default-rag-config?workspaceId=${workspaceId}`);
    if (!res.ok) throw new Error("Failed to load default RAG configuration");
    const config = (await res.json()) as RagConfig;
    setDefaultRagConfig(config);
    setBaseForm((current) => ({
      ...current,
      ragConfig: current.customizeRag ? current.ragConfig : cloneRagConfig(config),
    }));
  }, [workspaceId]);

  const loadDocuments = useCallback(async () => {
    if (!workspaceId || !selectedId) {
      setDocuments([]);
      return;
    }
    const res = await fetch(`/api/workspace/knowledge-bases/${selectedId}/documents?workspaceId=${workspaceId}`);
    if (!res.ok) throw new Error("Failed to load documents");
    setDocuments(await res.json());
  }, [workspaceId, selectedId]);

  async function openAttachDialog() {
    const canAttachKnowledgeBase = Boolean(selectedBaseCanEdit && workspaceId && selectedId);
    if (!canAttachKnowledgeBase) return;
    setAttachOpen(true);
    setLoadingAttachAgents(true);
    setAttachAgentsError(false);
    try {
      const res = await fetch(`/api/workspace/agents?workspaceId=${workspaceId}&includeModelMeta=true`);
      if (!res.ok) throw new Error(t("errorLoadAgents"));
      const data = (await res.json()) as { agents?: KnowledgeAgent[] } | KnowledgeAgent[];
      setAttachAgents(Array.isArray(data) ? data : (data.agents ?? []));
    } catch (error) {
      setAttachAgentsError(true);
      toast.error(error instanceof Error ? error.message : t("errorLoadAgents"));
      return;
    } finally {
      setLoadingAttachAgents(false);
    }
  }

  async function attachBaseToAgent(agentId: string) {
    const canAttachKnowledgeBase = Boolean(selectedBaseCanEdit && workspaceId && selectedId);
    if (!canAttachKnowledgeBase) return;
    setAttachingAgentId(agentId);
    try {
      const targetAgent = attachAgents.find((agent) => agent.id === agentId);
      if (!targetAgent) throw new Error(t("errorAttachAgent"));
      const bindingsRes = await fetch(`/api/workspace/agents/${agentId}/knowledge?workspaceId=${workspaceId}`);
      if (!bindingsRes.ok) throw new Error(t("errorAttachAgent"));
      const currentBindings =
        (
          (await bindingsRes.json()) as {
            bindings?: Array<{ knowledgeBaseId: string }>;
          }
        ).bindings ?? [];
      const knowledgeBaseIds = Array.from(new Set([...currentBindings.map((binding) => binding.knowledgeBaseId), selectedId]));
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
      toast.error(error instanceof Error ? error.message : t("errorAttachAgent"));
      return;
    } finally {
      setAttachingAgentId(null);
    }
  }

  async function ingestFromContent(title: string, content: string) {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    const canIngestContent = Boolean(selectedBaseCanEdit && workspaceId && selectedId && trimmedTitle && trimmedContent);
    if (!canIngestContent) return;
    const res = await fetch(`/api/workspace/knowledge-bases/${selectedId}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        title: trimmedTitle,
        content,
      }),
    });
    if (!res.ok) return toast.error(t("errorIngest"));
    setDocForm({ title: "", content: "" });
    await loadDocuments();
    toast.success(t("toastDocumentQueued"));
  }

  async function ingestFiles(files: File[]) {
    if (!selectedBaseCanEdit || !workspaceId || !selectedId || files.length === 0) return;
    setUploadingCount(files.length);
    setLastUpload(null);
    try {
      type UploadResult = {
        documents?: DocumentRow[];
        rejected?: Array<{ title: string; error: string }>;
        error?: string;
      };
      const results: UploadResult[] = [];
      let nextFileIndex = 0;
      const worker = async () => {
        while (nextFileIndex < files.length) {
          const file = files[nextFileIndex++];
          try {
            results.push(
              await uploadDocumentInChunks<UploadResult>({
                workspaceId,
                file,
                chunkUrl: `/api/workspace/knowledge-bases/${selectedId}/documents?uploadPhase=chunk`,
                completeUrl: `/api/workspace/knowledge-bases/${selectedId}/documents?uploadPhase=complete`,
                completeMetadata: {
                  fileName: file.webkitRelativePath || file.name,
                },
              }),
            );
          } catch (error) {
            results.push({
              rejected: [
                {
                  title: file.webkitRelativePath || file.name,
                  error: error instanceof Error ? error.message : t("errorIngest"),
                },
              ],
            });
          } finally {
            setUploadingCount((current) => Math.max(0, current - 1));
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, files.length) }, () => worker()));
      const accepted = results.reduce((sum, result) => sum + (result.documents?.length ?? 0), 0);
      const rejected = results.flatMap((result) => result.rejected ?? []);
      setLastUpload({ accepted, rejected });
      await loadDocuments();
      toast.success(t("toastBatchQueued", { accepted, rejected: rejected.length }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errorIngest"));
    } finally {
      setUploadingCount(0);
    }
  }

  function handleFileDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    void ingestFiles(Array.from(event.dataTransfer.files));
  }

  function ingestSelectedFiles(files: FileList | null) {
    void ingestFiles(files ? Array.from(files) : []);
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
          setCanManageModels(permissions.canManageModels);
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
          isGlobal: canManageTenantGlobals ? baseForm.isGlobal : undefined,
          ragConfig: baseForm.customizeRag ? baseForm.ragConfig : undefined,
        }),
      });
      if (!res.ok) return toast.error(t("errorCreate"));
      const created = (await res.json()) as KnowledgeBase;
      setBaseForm({
        name: "",
        description: "",
        isGlobal: false,
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
    const res = await fetch(`/api/workspace/knowledge-bases/${selectedId}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, query }),
    });
    if (!res.ok) return toast.error(t("errorSearch"));
    setResults(await res.json());
  }

  async function updateBase() {
    if (!canManageKnowledgeBases) return;
    if (!workspaceId) return;
    if (!editingBase?.canEdit) return;
    try {
      const res = await fetch(`/api/workspace/knowledge-bases/${editingBase.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name: editBaseForm.name.trim(),
          description: editBaseForm.description.trim() || undefined,
          isGlobal: canManageTenantGlobals ? editBaseForm.isGlobal : undefined,
          ragConfig: editBaseForm.customizeRag ? editBaseForm.ragConfig : null,
        }),
      });
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
      const res = await fetch(`/api/workspace/knowledge-bases/${baseId}?workspaceId=${workspaceId}`, { method: "DELETE" });
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
    const canDeleteDocument = Boolean(selectedBaseCanEdit && workspaceId && selectedId);
    if (!canDeleteDocument) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/workspace/knowledge-bases/${selectedId}/documents/${documentId}?workspaceId=${workspaceId}`, { method: "DELETE" });
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

  async function retryDocument(documentId: string) {
    if (!selectedBaseCanEdit || !workspaceId || !selectedId) return;
    try {
      const res = await fetch(`/api/workspace/knowledge-bases/${selectedId}/documents/${documentId}?workspaceId=${workspaceId}`, { method: "PATCH" });
      if (!res.ok) return toast.error(t("errorRetryDocument"));
      await loadDocuments();
      toast.success(t("toastDocumentRetried"));
    } catch {
      toast.error(t("errorRetryDocument"));
    }
  }

  async function openDocumentPreview(documentId: string) {
    if (!workspaceId || !selectedId) return;
    setPreviewDocument(null);
    setPreviewError(false);
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/workspace/knowledge-bases/${selectedId}/documents/${documentId}?workspaceId=${workspaceId}`);
      if (!res.ok) throw new Error("Failed to load document preview");
      const payload = (await res.json()) as { document: DocumentPreview };
      setPreviewDocument(payload.document);
    } catch {
      setPreviewError(true);
    } finally {
      setPreviewLoading(false);
    }
  }

  if (workspaceLoading || !workspaceId) {
    return <PageLoading label={tCommon("loading")} />;
  }

  const selectedBase = bases.find((base) => base.id === selectedId) ?? null;
  const selectedBaseCanEdit = Boolean(canManageKnowledgeBases && selectedBase?.canEdit);
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
  const filteredDocuments = documents.filter((document) => (documentFilter === "all" || document.status === documentFilter) && (!normalizedDocumentSearch || document.title.toLocaleLowerCase().includes(normalizedDocumentSearch)));
  const documentsPerPage = 12;
  const documentPageCount = Math.max(1, Math.ceil(filteredDocuments.length / documentsPerPage));
  const safeDocumentPage = Math.min(documentPage, documentPageCount);
  const visibleDocuments = filteredDocuments.slice((safeDocumentPage - 1) * documentsPerPage, safeDocumentPage * documentsPerPage);

  if (loadError) {
    return (
      <WorkspacePage title={t("orbitTitle")} accentTitle={t("orbitAccent")} eyebrow={t("orbitEyebrow")} description={t("orbitDescription")} width="wide">
        <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5" role="alert">
          <h2 className="text-base font-semibold">{t("loadErrorTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("loadErrorDescription")}</p>
          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => window.location.reload()}>
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
          <Button type="button" size="sm" onClick={() => setShowCreateDialog(true)}>
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            {t("newBase")}
          </Button>
        ) : null
      }
    >
      <Dialog open={canManageKnowledgeBases && showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("createBaseTitle")}</DialogTitle>
            <DialogDescription>{t("createBaseDescription")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Label htmlFor="knowledge-name">{t("name")}</Label>
            <Input id="knowledge-name" name="knowledge-name" autoComplete="off" value={baseForm.name} onChange={(e) => setBaseForm({ ...baseForm, name: e.target.value })} />
            <Label htmlFor="knowledge-description">{t("descriptionLabel")}</Label>
            <Input id="knowledge-description" name="knowledge-description" autoComplete="off" value={baseForm.description} onChange={(e) => setBaseForm({ ...baseForm, description: e.target.value })} />
            {canManageTenantGlobals ? (
              <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                <Checkbox id="knowledge-global" checked={baseForm.isGlobal} onCheckedChange={(checked) => setBaseForm({ ...baseForm, isGlobal: checked === true })} />
                <div className="grid gap-1.5 leading-none">
                  <Label htmlFor="knowledge-global">{t("globalLabel")}</Label>
                  <p className="text-xs text-muted-foreground">{t("globalDescription")}</p>
                </div>
              </div>
            ) : null}
            <AdvancedSection label={t("ragAdvanced")} hint={t("ragCreateAdvancedHint")} storageKey="advanced:knowledge-create-rag-config">
              <div className="grid gap-4">
                <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
                  <Checkbox
                    id="knowledge-custom-rag"
                    checked={baseForm.customizeRag}
                    onCheckedChange={(checked) =>
                      setBaseForm({
                        ...baseForm,
                        customizeRag: checked === true,
                        ragConfig: checked ? cloneRagConfig(baseForm.ragConfig) : cloneRagConfig(defaultRagConfig),
                      })
                    }
                  />
                  <div className="grid gap-1.5">
                    <Label htmlFor="knowledge-custom-rag">{t("ragCustomLabel")}</Label>
                    <p className="text-xs text-muted-foreground">{t("ragCreateCustomHint")}</p>
                  </div>
                </div>
                {baseForm.customizeRag ? <RagConfigFields idPrefix="create-rag" config={baseForm.ragConfig} onChange={(ragConfig) => setBaseForm({ ...baseForm, ragConfig })} canManageModels={canManageModels} models={ragModels} discoveringModels={discoveringRagModels} /> : null}
              </div>
            </AdvancedSection>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={() => void createBase()} disabled={!baseForm.name.trim()}>
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
              <span className="text-xs text-muted-foreground">{t("basesCount", { count: 0 })}</span>
            </div>
            <div className="mt-2 rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-xs leading-5 text-muted-foreground">{t("emptyTitle")}</div>
          </aside>
          <section className="flex min-h-[22rem] flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/55 p-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/8 text-primary">
              <BookOpenIcon className="size-5" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-lg font-semibold tracking-[-0.03em]">{t("emptyTitle")}</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{t("emptyBasesDescription")}</p>
            {canManageKnowledgeBases ? (
              <Button type="button" size="sm" className="mt-5" onClick={() => setShowCreateDialog(true)}>
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
              <span className="text-[0.7rem] text-muted-foreground">{t("basesCount", { count: bases.length })}</span>
            </div>
            <div className="flex flex-col gap-1">
              {bases.map((base) => (
                <div key={base.id} className={cn("group flex items-center gap-2 rounded-xl border border-transparent p-2 transition-colors", selectedId === base.id ? "border-primary/15 bg-primary/6" : "hover:bg-muted/45")}>
                  <button type="button" onClick={() => setSelectedId(base.id)} className="flex min-w-0 flex-1 items-center gap-2.5 border-0 bg-transparent p-0 text-left text-sm shadow-none outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 font-mono text-[0.62rem] font-medium uppercase text-primary">
                      {base.name
                        .split(/\s+/)
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium">{base.name}</span>
                      <span className="mt-1 block truncate text-[0.68rem] text-muted-foreground">{base.isGlobal ? t("scopeGlobal") : t("scopePrivate")}</span>
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
              <PageEmptyState icon={BookOpenIcon} title={t("selectBaseTitle")} description={t("selectBaseDescription")} />
            ) : (
              <>
                <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/55">
                  <header className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="min-w-0">
                          <p className="workspace-page-kicker text-[0.58rem]">{selectedBase?.isGlobal ? t("scopeGlobal") : t("scopePrivate")}</p>
                          <h2 className="mt-1 truncate text-lg font-semibold tracking-[-0.03em]">{selectedBase?.name ?? t("documents")}</h2>
                        </div>
                        {selectedBase ? <ResourceProvenanceBadge provenance={selectedBase.provenance} /> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{selectedBase?.description || t("documentsHint")}</p>
                    </div>
                    {selectedBaseCanEdit ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => void openAttachDialog()}>
                        {t("attachAssistant")}
                      </Button>
                    ) : null}
                  </header>

                  {selectedBaseCanEdit ? (
                    <div className="p-3">
                      <AdvancedSection key={`${selectedId}:${documents.length === 0 ? "empty" : "populated"}`} label={t("addDocuments")} hint={t("addDocumentsHint")} defaultOpen={documents.length === 0}>
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
                          className={cn("flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed px-5 py-5 text-center transition-colors", dragActive ? "border-primary bg-primary/6" : "border-primary/20 bg-primary/[0.025]")}
                          onDragOver={(event) => {
                            event.preventDefault();
                            setDragActive(true);
                          }}
                          onDragLeave={() => setDragActive(false)}
                          onDrop={handleFileDrop}
                        >
                          <UploadIcon className="size-5 text-primary" aria-hidden="true" />
                          <p className="mt-2 text-xs font-semibold">{t("dropTitle")}</p>
                          <p className="mt-1 text-[0.7rem] text-muted-foreground">{t("dropFormats")}</p>
                          <div className="mt-3 flex flex-wrap justify-center gap-2">
                            <Button type="button" size="sm" variant="outline" className="h-8" disabled={uploadingCount > 0} onClick={() => documentInputRef.current?.click()}>
                              {t("browseFiles")}
                            </Button>
                            <Button type="button" size="sm" variant="outline" className="h-8" disabled={uploadingCount > 0} onClick={() => folderInputRef.current?.click()}>
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
                        <AdvancedSection label={t("pasteContent")} hint={t("pasteContentHint")} storageKey="advanced:knowledge-paste-content" className="mt-3">
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
                            <Button className="justify-self-end" onClick={() => void ingestDocument()} disabled={!docForm.title.trim() || !docForm.content.trim()}>
                              {t("ingestDocument")}
                            </Button>
                          </div>
                        </AdvancedSection>
                      </AdvancedSection>
                    </div>
                  ) : null}

                  <div className="border-t border-border/55">
                    {documentsError ? (
                      <div className="m-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4" role="alert">
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
                    ) : null}
                    {!documentsError && documents.length === 0 ? <p className="m-3 rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">{t("documentsEmpty")}</p> : null}
                    {!documentsError && documents.length > 0 ? (
                      <>
                        <div className="grid gap-3 border-b border-border/55 bg-muted/[0.18] p-3">
                          <div className="grid grid-cols-3 gap-2 sm:max-w-md">
                            {(["ready", "processing", "failed"] as const).map((status) => (
                              <button
                                key={status}
                                type="button"
                                className={cn("rounded-lg border px-2.5 py-2 text-left transition-colors", documentFilter === status ? "border-primary/35 bg-primary/8" : "border-border/60 bg-background/60 hover:bg-muted/60")}
                                onClick={() => {
                                  setDocumentPage(1);
                                  setDocumentFilter((current) => (current === status ? "all" : status));
                                }}
                                aria-pressed={documentFilter === status}
                              >
                                <span className="block text-base font-semibold tabular-nums">{documentCounts[status]}</span>
                                <span className="block truncate text-[0.65rem] text-muted-foreground">{statusLabel(status, t)}</span>
                              </button>
                            ))}
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="relative min-w-0 flex-1 sm:max-w-sm">
                              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
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
                            <p className="shrink-0 text-xs text-muted-foreground" aria-live="polite">
                              {t("documentListCount", {
                                visible: filteredDocuments.length,
                                total: documents.length,
                              })}
                            </p>
                          </div>
                        </div>

                        {visibleDocuments.length === 0 ? (
                          <div className="p-8 text-center">
                            <p className="text-sm font-medium">{t("documentsFilteredEmpty")}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{t("documentsFilteredEmptyHint")}</p>
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
                              <article key={doc.id} className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-muted/25 sm:gap-3">
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/55 bg-background text-muted-foreground">
                                  <FileTextIcon className="size-3.5" aria-hidden="true" />
                                </span>
                                <div className="min-w-0">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <button type="button" className="min-w-0 truncate text-left text-xs font-medium hover:text-primary disabled:cursor-default disabled:hover:text-foreground" disabled={doc.status !== "ready"} onClick={() => void openDocumentPreview(doc.id)}>
                                      {doc.title}
                                    </button>
                                    <span className="hidden shrink-0 text-[0.65rem] text-muted-foreground sm:inline">{new Date(doc.createdAt).toLocaleDateString()}</span>
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
                                        className={cn("h-full rounded-full transition-[width] duration-500", doc.status === "failed" ? "bg-destructive" : "bg-primary")}
                                        style={{
                                          width: `${doc.processingProgress}%`,
                                        }}
                                      />
                                    </div>
                                    <span className="w-8 text-right text-[0.65rem] tabular-nums text-muted-foreground">{doc.processingProgress}%</span>
                                    <span className="hidden truncate text-[0.65rem] text-muted-foreground md:inline">{t(`processingStage.${doc.processingStage}`)}</span>
                                  </div>
                                  {doc.errorMessage ? <p className="mt-1 truncate text-[0.65rem] text-destructive">{doc.errorMessage}</p> : null}
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                  <Badge variant={statusVariant(doc.status)} className="hidden text-[0.62rem] sm:inline-flex">
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
                              <Button type="button" size="icon-sm" variant="outline" disabled={safeDocumentPage <= 1} aria-label={t("previousDocumentPage")} onClick={() => setDocumentPage((current) => Math.max(1, current - 1))}>
                                <ChevronLeftIcon aria-hidden="true" />
                              </Button>
                              <Button type="button" size="icon-sm" variant="outline" disabled={safeDocumentPage >= documentPageCount} aria-label={t("nextDocumentPage")} onClick={() => setDocumentPage((current) => Math.min(documentPageCount, current + 1))}>
                                <ChevronRightIcon aria-hidden="true" />
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
                <AdvancedSection label={t("optionalSearch")} hint={t("optionalSearchHint")} storageKey="advanced:knowledge-search">
                  <div className="grid gap-3">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input aria-label={t("searchAriaLabel")} name="knowledge-search" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchPlaceholder")} />
                      <Button onClick={() => void search()}>
                        <SearchIcon data-icon="inline-start" aria-hidden="true" />
                        {t("search")}
                      </Button>
                    </div>
                    {results.map((result) => (
                      <div key={result.chunkId} className="rounded-xl border p-3 text-sm">
                        <p className="font-medium">{result.documentTitle}</p>
                        <p className="mt-1 line-clamp-4 text-muted-foreground">{result.content}</p>
                      </div>
                    ))}
                  </div>
                </AdvancedSection>
              </>
            )}
          </section>
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
                <DialogTitle className="truncate pr-8">{previewDocument?.documentTitle ?? t("documentPreviewTitle")}</DialogTitle>
                <DialogDescription>
                  {previewDocument
                    ? t("documentPreviewDescription", {
                        chunks: previewDocument.chunks.length,
                      })
                    : t("documentPreviewLoading")}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-4 py-4 sm:px-6">
                {previewLoading ? (
                  <div className="flex min-h-64 items-center justify-center" aria-live="polite">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
                    <span className="sr-only">{t("documentPreviewLoading")}</span>
                  </div>
                ) : previewError ? (
                  <div className="flex min-h-64 flex-col items-center justify-center text-center" role="alert">
                    <p className="text-sm font-medium">{t("documentPreviewError")}</p>
                    <p className="mt-1 max-w-md text-xs text-muted-foreground">{t("documentPreviewErrorHint")}</p>
                  </div>
                ) : previewDocument ? (
                  <article className="mx-auto max-w-2xl space-y-2">
                    {previewDocument.chunks.map((chunk) => (
                      <section key={chunk.chunkId} data-chunk-index={chunk.chunkIndex} className="rounded-xl border border-border/65 bg-background px-5 py-4 shadow-sm sm:px-6">
                        <p className="mb-2 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-muted-foreground">{t("documentChunk", { number: chunk.chunkIndex + 1 })}</p>
                        <p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground/90">{chunk.content}</p>
                      </section>
                    ))}
                  </article>
                ) : null}
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={Boolean(editingBase?.canEdit) && canManageKnowledgeBases} onOpenChange={() => setEditingBase(null)}>
            <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("editBaseTitle")}</DialogTitle>
                <DialogDescription>{t("editBaseDescription")}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <Label htmlFor="edit-knowledge-name">{t("name")}</Label>
                <Input id="edit-knowledge-name" name="edit-knowledge-name" autoComplete="off" value={editBaseForm.name} onChange={(e) => setEditBaseForm({ ...editBaseForm, name: e.target.value })} />
                <Label htmlFor="edit-knowledge-description">{t("descriptionLabel")}</Label>
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
                      <Label htmlFor="edit-knowledge-global">{t("globalLabel")}</Label>
                      <p className="text-xs text-muted-foreground">{t("globalDescription")}</p>
                    </div>
                  </div>
                ) : null}
                <AdvancedSection label={t("ragAdvanced")} hint={t("ragAdvancedHint")} storageKey="advanced:knowledge-rag-config">
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
                        <Label htmlFor="edit-knowledge-custom-rag">{t("ragCustomLabel")}</Label>
                        <p className="text-xs text-muted-foreground">{t("ragCustomHint")}</p>
                      </div>
                    </div>
                    {editBaseForm.customizeRag && editBaseForm.ragConfig ? <RagConfigFields idPrefix="edit-rag" config={editBaseForm.ragConfig} onChange={(ragConfig) => setEditBaseForm({ ...editBaseForm, ragConfig })} canManageModels={canManageModels} models={ragModels} discoveringModels={discoveringRagModels} /> : null}
                  </div>
                </AdvancedSection>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingBase(null)}>
                  {tCommon("cancel")}
                </Button>
                <Button onClick={() => void updateBase()} disabled={!editingBase?.canEdit || !editBaseForm.name.trim()}>
                  {tCommon("save")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={selectedBaseCanEdit && attachOpen} onOpenChange={setAttachOpen}>
            <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("attachDialogTitle")}</DialogTitle>
                <DialogDescription>{t("attachDialogDescription")}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                {loadingAttachAgents ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
                  </div>
                ) : attachAgentsError ? (
                  <div className="py-6 text-center" role="alert">
                    <p className="text-sm text-muted-foreground">{t("errorLoadAgents")}</p>
                    <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void openAttachDialog()}>
                      {t("retry")}
                    </Button>
                  </div>
                ) : attachAgents.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">{t("noAttachAgents")}</p>
                ) : (
                  attachAgents.map((agent) => {
                    const canAttach = Boolean(agent.canEdit && agent.activeVersionId);
                    return (
                      <button key={agent.id} type="button" disabled={!canAttach || attachingAgentId !== null} className="flex items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void attachBaseToAgent(agent.id)}>
                        <ModelLogo logoUrl={agent.logoUrl} label={agent.name} size="md" imageFit="cover" className="rounded-full" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{agent.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{agent.modelDisplayName || t("agentNeedsModel")}</span>
                        </span>
                        {attachingAgentId === agent.id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
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
            <AlertDialogTitle>{pendingDelete?.kind === "document" ? t("confirmDeleteDocument") : t("confirmDeleteBase")}</AlertDialogTitle>
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
            <AlertDialogCancel disabled={deleting}>{tCommon("cancel")}</AlertDialogCancel>
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
