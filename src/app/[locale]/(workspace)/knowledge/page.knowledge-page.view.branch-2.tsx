import { Button } from "@/components/ui/button";
import { BookOpenIcon, PlusIcon } from "lucide-react";
import type { KnowledgePageViewModel } from "./page.knowledge-page.view";
export function KnowledgePageBranch2({ model }: { model: KnowledgePageViewModel }) {
  const { canManageKnowledgeBases, setShowCreateDialog, t } = model;
  return (
    <div className="grid min-h-[22rem] gap-3 lg:grid-cols-[16rem_1fr]">
      <aside className="overflow-hidden rounded-2xl border border-border/70 bg-card/55 p-3">
        <div className="flex items-center justify-between px-2 py-2">
          <p className="text-sm font-semibold">{t("basesTitle")}</p>
          <span className="text-xs text-muted-foreground">{t("basesCount", { count: 0 })}</span>
        </div>
        <div className="mt-2 rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-xs leading-5 text-muted-foreground">{t("emptyTitle")}</div>
      </aside>
      <section className="flex min-h-[22rem] flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/55 p-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/8 text-primary">
          <BookOpenIcon className="size-5" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-lg font-semibold tracking-[-0.03em]">{t("emptyTitle")}</h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{t("emptyBasesDescription")}</p>
        {canManageKnowledgeBases ? (
          <Button type="button" size="sm" className="mt-5" onClick={() => setShowCreateDialog(true)}>
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            {t("createBaseCta")}
          </Button>
        ) : null}
      </section>
    </div>
  );
}
