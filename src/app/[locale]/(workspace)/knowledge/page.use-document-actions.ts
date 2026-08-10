import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import type { DocumentPreview, KnowledgeBase } from "./page.knowledge-base";

export function useKnowledgeDocumentActions(input: {
  workspaceId: string | null;
  selectedId: string | null;
  selectedBaseCanEdit: boolean;
  canManageKnowledgeBases: boolean;
  bases: KnowledgeBase[];
  loadBases: () => Promise<void>;
  loadDocuments: () => Promise<void>;
}) {
  const {
    workspaceId,
    selectedId,
    selectedBaseCanEdit,
    canManageKnowledgeBases,
    bases,
    loadBases,
    loadDocuments,
  } = input;
  const t = useTranslations("knowledge");
  const [previewDocument, setPreviewDocument] =
    useState<DocumentPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: "base"; id: string; name: string }
    | { kind: "document"; id: string; name: string }
    | null
  >(null);
  const [deleting, setDeleting] = useState(false);
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

  async function retryDocument(documentId: string) {
    if (!selectedBaseCanEdit || !workspaceId || !selectedId) return;
    try {
      const res = await fetch(
        `/api/workspace/knowledge-bases/${selectedId}/documents/${documentId}?workspaceId=${workspaceId}`,
        { method: "PATCH" },
      );
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
      const res = await fetch(
        `/api/workspace/knowledge-bases/${selectedId}/documents/${documentId}?workspaceId=${workspaceId}`,
      );
      if (!res.ok) throw new Error("Failed to load document preview");
      const payload = (await res.json()) as { document: DocumentPreview };
      setPreviewDocument(payload.document);
    } catch {
      setPreviewError(true);
    } finally {
      setPreviewLoading(false);
    }
  }
  return {
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
  };
}
