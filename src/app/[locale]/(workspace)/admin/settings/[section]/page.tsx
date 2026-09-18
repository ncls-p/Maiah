import { isPlatformAdminSession } from "@/modules/admin/auth";
import { getSession } from "@/modules/auth/session";
import { Suspense } from "react";
import { redirect } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { OrganizationAdministration } from "@/components/iam/organization-administration";
import { OrganizationDirectory } from "@/components/iam/organization-directory";
import { OrganizationSettingsPage } from "@/components/admin/organization-settings-page";
import { PlatformSettingsPage } from "@/components/admin/platform-settings-page";
import {
  isOrganizationSettingsSection,
  isPlatformSettingsSection,
} from "@/components/admin/settings-navigation";

export default async function SettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string; locale: string }>;
}) {
  const { section, locale } = await params;
  if (section === "directory")
    redirect({ href: "/admin/settings/projects", locale });
  if (
    !isOrganizationSettingsSection(section) &&
    !isPlatformSettingsSection(section)
  )
    notFound();
  if (
    isPlatformSettingsSection(section) &&
    !(await isPlatformAdminSession(await getSession()))
  )
    notFound();
  const t = await getTranslations("admin.navigation");
  return (
    <section className="flex min-w-0 flex-col gap-5">
      <h2 className="text-2xl font-semibold tracking-tight">{t(section)}</h2>
      <Suspense>
        {section === "organizations" ? (
          <>
            <OrganizationDirectory section="organizations" />
            <OrganizationAdministration />
          </>
        ) : section === "projects" || section === "members" ? (
          <OrganizationDirectory key={section} section={section} />
        ) : isOrganizationSettingsSection(section) ? (
          <OrganizationSettingsPage section={section} />
        ) : (
          <PlatformSettingsPage section={section} />
        )}
      </Suspense>
    </section>
  );
}
