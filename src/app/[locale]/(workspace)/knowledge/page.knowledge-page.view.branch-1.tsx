import type { KnowledgePageViewModel } from "./page.knowledge-page.view";
import { KnowledgeMainSection1 } from "./page.knowledge-page.view.branch-1.section-1";
import { KnowledgeMainSection2 } from "./page.knowledge-page.view.branch-1.section-2";
import { KnowledgeMainSection3 } from "./page.knowledge-page.view.branch-1.section-3";
import { KnowledgeMainSection4 } from "./page.knowledge-page.view.branch-1.section-4";
import { KnowledgeMainSection5 } from "./page.knowledge-page.view.branch-1.section-5";

export function KnowledgePageBranch1({ model }: { model: KnowledgePageViewModel }) {
  const {} = model;
  return (
    <div className="grid gap-3 lg:grid-cols-[16rem_1fr]">
      <KnowledgeMainSection5 model={model} />
      <KnowledgeMainSection4 model={model} />
      <KnowledgeMainSection3 model={model} />
      <KnowledgeMainSection2 model={model} />
      <KnowledgeMainSection1 model={model} />
    </div>
  );
}
