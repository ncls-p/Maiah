import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowRightIcon, ShieldCheckIcon } from "lucide-react";

import { WorkspacePage } from "@/components/workspace-page";
import { Button } from "@/components/ui/button";
import { ensureBootstrapAdmin, isAdminRole } from "@/modules/admin/use-cases";
import { getSession } from "@/modules/auth/session";

import { SettingsPasswordCard } from "./settings-password-card";

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  const tAdmin = await getTranslations("admin");
  const session = await getSession();
  const bootstrappedAdminId = await ensureBootstrapAdmin();
  const isAdmin =
    isAdminRole(session?.user.role) || bootstrappedAdminId === session?.user.id;

  return (
    <WorkspacePage
      title={t("title")}
      description={t("description")}
      width="default"
    >
      <div className="flex max-w-4xl flex-col gap-4">
        <SettingsPasswordCard />

        {isAdmin ? (
          <section className="overflow-hidden rounded-2xl border border-border/70 bg-card p-0">
            <div className="px-5 py-5 sm:px-6">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="flex size-8 items-center justify-center rounded-lg bg-muted">
                  <ShieldCheckIcon className="size-4" aria-hidden="true" />
                </span>
                <h2 className="text-sm font-semibold">{t("adminLinkTitle")}</h2>
              </div>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {t("adminLinkDescription")}
              </p>
            </div>
            <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/25 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-sm text-muted-foreground">
                {tAdmin("platformSettingsDescription")}
              </p>
              <Button asChild variant="outline">
                <Link href="/admin/settings">
                  {t("goToAdminSettings")}
                  <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </section>
        ) : null}
      </div>
    </WorkspacePage>
  );
}
