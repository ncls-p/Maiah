import { Button } from "@/components/ui/button";
import { RotateCcwIcon } from "lucide-react";
import type { KnowledgePageViewModel } from "./page.knowledge-page.view";
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
