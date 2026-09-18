import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { OrganizationCustomization } from "@/components/admin/organization-customization";
import { OrganizationAdministration } from "@/components/iam/organization-administration";
import { OrganizationDirectory } from "@/components/iam/organization-directory";
import { ResourceDistributionPanel } from "@/components/iam/resource-distribution-panel";
import { UsageLimitsPanel } from "@/components/iam/usage-limits-panel";
import { AdminSettingsTabs } from "@/components/admin/admin-settings-tabs";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AssistantGovernanceSettings } from "@/components/admin/assistant-governance-settings";
import { RagSettings } from "@/components/admin/rag-settings";
import { RegistrationSettings } from "@/components/admin/registration-settings";
import { SystemHealthCard } from "@/components/admin/system-health-card";
import { UsageImpactSettings } from "@/components/admin/usage-impact-settings";
import { WorkspacePage } from "@/components/workspace-page";
import { isPlatformAdminSession } from "@/modules/admin/auth";
import { getRegistrationSetting } from "@/modules/admin/use-cases";
import { getSession } from "@/modules/auth/session";
import { getDefaultRagConfig } from "@/modules/knowledge/rag-config";
import { getUsageImpactSetting } from "@/modules/provider/usage-impact-settings";

export default async function AdminSettingsPage() {
  const t = await getTranslations("admin");
  const connections = await getTranslations("connections");
  const session = await getSession();
  const isAdmin = await isPlatformAdminSession(session);

  if (!session) return null;
  const platformSettings = isAdmin
    ? await Promise.all([
        getRegistrationSetting(),
        getUsageImpactSetting(),
        getDefaultRagConfig(),
      ])
    : null;

  return (
    <WorkspacePage
      title={t("platformSettingsTitle")}
      description={t("platformSettingsDescription")}
      width="default"
      actions={
        <Button asChild variant="outline">
          <Link href="/admin/connections">{connections("title")}</Link>
        </Button>
      }
    >
      <Suspense>
        <AdminSettingsTabs
          organization={
            <>
              <OrganizationAdministration />
              <OrganizationDirectory />
              <OrganizationCustomization />
            </>
          }
          platform={
            platformSettings ? (
              <>
                <div className="grid gap-6 lg:grid-cols-2">
                  <RegistrationSettings initialState={platformSettings[0]} />
                  <SystemHealthCard />
                  <UsageImpactSettings initialState={platformSettings[1]} />
                </div>
                <RagSettings initialState={platformSettings[2]} />
                <AssistantGovernanceSettings />
                <ResourceDistributionPanel />
                <UsageLimitsPanel />
              </>
            ) : null
          }
        />
      </Suspense>
    </WorkspacePage>
  );
}
