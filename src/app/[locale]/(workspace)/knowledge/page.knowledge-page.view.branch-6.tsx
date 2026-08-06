import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import type { KnowledgePageViewModel } from "./page.knowledge-page.view";
export function KnowledgePageBranch6({ model }: { model: KnowledgePageViewModel }) {
  const { setShowCreateDialog, t } = model;
  return (
    <Button type="button" size="sm" onClick={() => setShowCreateDialog(true)}>
      <PlusIcon data-icon="inline-start" aria-hidden="true" />
      {t("newBase")}
    </Button>
  );
}
