import type { KnowledgePageViewModel } from "./page.knowledge-page.view";
import { KnowledgeDocumentsBranch1 } from "./page.knowledge-page.view.branch-1.section-4.branch-1";
import { KnowledgeDocumentsBranch2 } from "./page.knowledge-page.view.branch-1.section-4.branch-2";

export function KnowledgeMainSection4({ model }: { model: KnowledgePageViewModel }) {
  const { selectedId } = model;
  return <section className="min-w-0">{!selectedId ? <KnowledgeDocumentsBranch2 model={model} /> : <KnowledgeDocumentsBranch1 model={model} />}</section>;
}
