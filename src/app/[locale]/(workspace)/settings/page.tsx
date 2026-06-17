import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowRightIcon, ShieldCheckIcon } from "lucide-react";

import { WorkspacePage } from "@/components/workspace-page";
import { Button } from "@/components/ui/button";
import { ensureBootstrapAdmin, isAdminRole } from "@/modules/admin/use-cases";
import { getSession } from "@/modules/auth/session";

import { SettingsLocaleCard } from "./settings-locale";

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
      <div className="flex flex-col gap-6">
        <SettingsLocaleCard />

        {isAdmin ? (
          <section className="overflow-hidden rounded-2xl border bg-card p-0 animate-in-fade stagger-2">
            <div className="border-b px-5 py-5 sm:px-6">
              <div className="flex items-center gap-2 text-primary">
                <ShieldCheckIcon className="size-4" aria-hidden="true" />
                <h2 className="text-sm font-semibold uppercase tracking-wider">
                  {t("adminLinkTitle")}
                </h2>
              </div>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {t("adminLinkDescription")}
              </p>
            </div>
            <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
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
