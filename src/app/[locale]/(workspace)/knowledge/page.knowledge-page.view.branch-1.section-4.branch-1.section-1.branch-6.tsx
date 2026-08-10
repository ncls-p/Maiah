import { ResourceProvenanceBadge } from "@/components/resource-provenance-badge";
import type { KnowledgePageViewModel } from "./page.knowledge-page.view";
export function KnowledgeDocumentTableBranch6({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const { selectedBase } = model;
  return <ResourceProvenanceBadge provenance={selectedBase!.provenance} />;
}
