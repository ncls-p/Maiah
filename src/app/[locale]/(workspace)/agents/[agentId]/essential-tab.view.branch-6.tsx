import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

import type { EssentialTabViewModel } from "./essential-tab.view";
export function EssentialTabBranch6({ model }: { model: EssentialTabViewModel }) {
  const { canManageProviders, t } = model;
  return (
    <div role="status" className="flex flex-col gap-3 rounded-2xl border border-dashed border-border/80 bg-muted/35 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium text-foreground">{t("configurePage.noModelConnectionTitle")}</p>
        <p className="mt-1 text-muted-foreground">{canManageProviders ? t("configurePage.noModelConnectionAdmin") : t("configurePage.noModelConnectionMember")}</p>
      </div>
      {canManageProviders ? (
        <Button asChild type="button" variant="outline" size="sm">
          <Link href="/providers">{t("configurePage.configureModels")}</Link>
        </Button>
      ) : null}
    </div>
  );
}
