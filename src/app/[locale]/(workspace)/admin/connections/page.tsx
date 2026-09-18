import { getTranslations } from "next-intl/server";
import { OrganizationConnections } from "@/components/admin/organization-connections";
import { Suspense } from "react";
import { getSession } from "@/modules/auth/session";

export default async function ConnectionsPage() {
  const t = await getTranslations("connections");
  const session = await getSession();
  if (!session) return null;
  return (
    <section className="flex min-w-0 flex-col gap-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{t("title")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <Suspense>
        <OrganizationConnections />
      </Suspense>
    </section>
  );
}
