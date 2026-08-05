import { Button } from "@/components/ui/button";
import type { KnowledgePageViewModel } from "./page.knowledge-page.view";
export function KnowledgeDocumentTableBranch5({ model }: { model: KnowledgePageViewModel }) {
  const { openAttachDialog, t } = model;
  return (
    <Button type="button" size="sm" variant="outline" onClick={() => void openAttachDialog()}>
      {t("attachAssistant")}
    </Button>
  );
}
