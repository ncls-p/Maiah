import { PageEmptyState } from "@/components/page-empty-state";
import { BookOpenIcon } from "lucide-react";
import type { KnowledgePageViewModel } from "./page.knowledge-page.view";
export function KnowledgeDocumentsBranch2({ model }: { model: KnowledgePageViewModel }) {
  const { t } = model;
  return <PageEmptyState icon={BookOpenIcon} title={t("selectBaseTitle")} description={t("selectBaseDescription")} />;
}
