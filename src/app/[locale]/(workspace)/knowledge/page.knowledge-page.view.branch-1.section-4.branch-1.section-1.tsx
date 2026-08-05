import type { KnowledgePageViewModel } from "./page.knowledge-page.view";
import { KnowledgeDocumentTableBranch1 } from "./page.knowledge-page.view.branch-1.section-4.branch-1.section-1.branch-1";
import { KnowledgeDocumentTableBranch2 } from "./page.knowledge-page.view.branch-1.section-4.branch-1.section-1.branch-2";
import { KnowledgeDocumentTableBranch3 } from "./page.knowledge-page.view.branch-1.section-4.branch-1.section-1.branch-3";
import { KnowledgeDocumentTableBranch4 } from "./page.knowledge-page.view.branch-1.section-4.branch-1.section-1.branch-4";
import { KnowledgeDocumentTableBranch5 } from "./page.knowledge-page.view.branch-1.section-4.branch-1.section-1.branch-5";
import { KnowledgeDocumentTableBranch6 } from "./page.knowledge-page.view.branch-1.section-4.branch-1.section-1.branch-6";

export function KnowledgeDocumentListSection1({ model }: { model: KnowledgePageViewModel }) {
  const { documents, documentsError, selectedBase, selectedBaseCanEdit, t } = model;
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/55">
      <header className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0">
              <p className="workspace-page-kicker text-[0.58rem]">{selectedBase?.isGlobal ? t("scopeGlobal") : t("scopePrivate")}</p>
              <h2 className="mt-1 truncate text-lg font-semibold tracking-[-0.03em]">{selectedBase?.name ?? t("documents")}</h2>
            </div>
            {selectedBase ? <KnowledgeDocumentTableBranch6 model={model} /> : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{selectedBase?.description || t("documentsHint")}</p>
        </div>
        {selectedBaseCanEdit ? <KnowledgeDocumentTableBranch5 model={model} /> : null}
      </header>

      {selectedBaseCanEdit ? <KnowledgeDocumentTableBranch4 model={model} /> : null}

      <div className="border-t border-border/55">
        {documentsError ? <KnowledgeDocumentTableBranch3 model={model} /> : null}
        {!documentsError && documents.length === 0 ? <KnowledgeDocumentTableBranch2 model={model} /> : null}
        {!documentsError && documents.length > 0 ? <KnowledgeDocumentTableBranch1 model={model} /> : null}
      </div>
    </div>
  );
}
