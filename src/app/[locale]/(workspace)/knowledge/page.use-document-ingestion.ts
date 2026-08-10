import { useTranslations } from "next-intl";
import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";

import { uploadDocumentInChunks } from "@/modules/document-upload/chunked-upload";
import type { DocumentRow } from "./page.knowledge-base";

export function useKnowledgeDocumentIngestion(input: {
  workspaceId: string | null;
  selectedId: string | null;
  selectedBaseCanEdit: boolean;
  loadDocuments: () => Promise<void>;
}) {
  const { workspaceId, selectedId, selectedBaseCanEdit, loadDocuments } = input;
  const t = useTranslations("knowledge");
  const [docForm, setDocForm] = useState({ title: "", content: "" });
  const [dragActive, setDragActive] = useState(false);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [lastUpload, setLastUpload] = useState<{
    accepted: number;
    rejected: Array<{ title: string; error: string }>;
  } | null>(null);
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

  async function ingestFiles(files: File[]) {
    if (
      !selectedBaseCanEdit ||
      !workspaceId ||
      !selectedId ||
      files.length === 0
    )
      return;
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
                  error:
                    error instanceof Error ? error.message : t("errorIngest"),
                },
              ],
            });
          } finally {
            setUploadingCount((current) => Math.max(0, current - 1));
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(3, files.length) }, () => worker()),
      );
      const accepted = results.reduce(
        (sum, result) => sum + (result.documents?.length ?? 0),
        0,
      );
      const rejected = results.flatMap((result) => result.rejected ?? []);
      setLastUpload({ accepted, rejected });
      await loadDocuments();
      toast.success(
        t("toastBatchQueued", { accepted, rejected: rejected.length }),
      );
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
  return {
    docForm,
    setDocForm,
    dragActive,
    setDragActive,
    documentInputRef,
    folderInputRef,
    uploadingCount,
    lastUpload,
    ingestFromContent,
    ingestFiles,
    handleFileDrop,
    ingestSelectedFiles,
  };
}
