import { AdvancedSection } from "@/components/ui/advanced-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Loader2, UploadIcon } from "lucide-react";
import type { KnowledgePageViewModel } from "./page.knowledge-page.view";
export function KnowledgeDocumentTableBranch4({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const {
    docForm,
    documentInputRef,
    documents,
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
        key={`${selectedId}:${documents.length === 0 ? "empty" : "populated"}`}
        label={t("addDocuments")}
        hint={t("addDocumentsHint")}
        defaultOpen={documents.length === 0}
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
