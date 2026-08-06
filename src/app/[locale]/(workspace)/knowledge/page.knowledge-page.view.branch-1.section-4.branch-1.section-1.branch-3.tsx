import { Button } from "@/components/ui/button";
import type { KnowledgePageViewModel } from "./page.knowledge-page.view";
export function KnowledgeDocumentTableBranch3({ model }: { model: KnowledgePageViewModel }) {
  const { loadDocuments, setDocumentsError, t } = model;
  return (
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
  );
}
