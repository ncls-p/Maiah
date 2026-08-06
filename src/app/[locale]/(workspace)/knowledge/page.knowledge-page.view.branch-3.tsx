import { PageLoading } from "@/components/page-loading";
import type { KnowledgePageViewModel } from "./page.knowledge-page.view";
export function KnowledgePageBranch3({ model }: { model: KnowledgePageViewModel }) {
  const { tCommon } = model;
  return <PageLoading label={tCommon("loading")} />;
}
