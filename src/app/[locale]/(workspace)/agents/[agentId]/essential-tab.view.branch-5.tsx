import type { EssentialTabViewModel } from "./essential-tab.view";
export function EssentialTabBranch5({ model }: { model: EssentialTabViewModel }) {
  const { canManageProviders, t } = model;
  return (
    <div role="status" className="rounded-2xl border border-dashed border-border/80 bg-muted/35 p-4 text-sm">
      <p className="font-medium text-foreground">{t("configurePage.noModelsForProviderTitle")}</p>
      <p className="mt-1 text-muted-foreground">{canManageProviders ? t("configurePage.noModelsForProviderAdmin") : t("configurePage.noModelsForProviderMember")}</p>
    </div>
  );
}
