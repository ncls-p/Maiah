import type { KnowledgePageViewModel } from "./page.knowledge-page.view";
export function KnowledgeDocumentTableBranch2({ model }: { model: KnowledgePageViewModel }) {
  const { t } = model;
  return <p className="m-3 rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">{t("documentsEmpty")}</p>;
}
