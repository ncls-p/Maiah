import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PencilIcon, Trash2Icon } from "lucide-react";
import type { KnowledgePageViewModel } from "./page.knowledge-page.view";
export function KnowledgeMainSection5({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const {
    bases,
    canManageKnowledgeBases,
    selectedId,
    setEditBaseForm,
    setEditingBase,
    setPendingDelete,
    setSelectedId,
    t,
  } = model;
  return (
    <aside className="overflow-hidden rounded-2xl border border-border/70 bg-card/55 p-2.5">
      <div className="flex items-center justify-between px-2 py-2.5">
        <p className="text-sm font-semibold">{t("basesTitle")}</p>
        <span className="text-[0.7rem] text-muted-foreground">
          {t("basesCount", { count: bases.length })}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {bases.map((base) => (
          <div
            key={base.id}
            className={cn(
              "group flex items-center gap-2 rounded-xl border border-transparent p-2 transition-colors",
              selectedId === base.id
                ? "border-primary/15 bg-primary/6"
                : "hover:bg-muted/45",
            )}
          >
            <button
              type="button"
              onClick={() => setSelectedId(base.id)}
              className="flex min-w-0 flex-1 items-center gap-2.5 border-0 bg-transparent p-0 text-left text-sm shadow-none outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 font-mono text-[0.62rem] font-medium uppercase text-primary">
                {base.name
                  .split(/\s+/)
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium">
                  {base.name}
                </span>
                <span className="mt-1 block truncate text-[0.68rem] text-muted-foreground">
                  {base.isGlobal ? t("scopeGlobal") : t("scopePrivate")}
                </span>
              </span>
            </button>
            {canManageKnowledgeBases ? (
              <div className="flex shrink-0 gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("editAria", { name: base.name })}
                  disabled={!base.canEdit}
                  onClick={() => {
                    setEditingBase(base);
                    setEditBaseForm({
                      name: base.name,
                      description: base.description ?? "",
                      isGlobal: base.isGlobal,
                      customizeRag: !base.usesDefaultRagConfig,
                      ragConfig: base.effectiveRagConfig,
                    });
                  }}
                >
                  <PencilIcon aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("deleteAria", { name: base.name })}
                  disabled={!base.canEdit}
                  onClick={() =>
                    setPendingDelete({
                      kind: "base",
                      id: base.id,
                      name: base.name,
                    })
                  }
                >
                  <Trash2Icon aria-hidden="true" />
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </aside>
  );
}
