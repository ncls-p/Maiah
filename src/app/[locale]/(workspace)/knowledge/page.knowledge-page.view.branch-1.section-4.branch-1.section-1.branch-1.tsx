import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  FileTextIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import type { KnowledgePageViewModel } from "./page.knowledge-page.view";
import { statusLabel, statusVariant } from "./page.status-variant";
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
