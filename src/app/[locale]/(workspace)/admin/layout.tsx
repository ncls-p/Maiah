import { Suspense, type ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/modules/auth/session";
import { isPlatformAdminSession } from "@/modules/admin/auth";
import { SettingsSidebar } from "@/components/admin/settings-sidebar";
import { WorkspacePage } from "@/components/workspace-page";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getSession();
  if (!session) return null;
  const isAdmin = await isPlatformAdminSession(session);
  const t = await getTranslations("admin");
  return (
    <WorkspacePage
      title={t("platformSettingsTitle")}
      description={t("platformSettingsDescription")}
      width="wide"
      headerVariant="compact"
      showKicker={false}
    >
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <Suspense>
          <SettingsSidebar isPlatformAdmin={isAdmin} />
        </Suspense>
        <div className="min-w-0">{children}</div>
      </div>
    </WorkspacePage>
  );
}
