"use client";

import { useTranslations } from "next-intl";
import { OrganizationBrandingCard } from "@/app/[locale]/(workspace)/admin/settings/organization-branding-card";
import { OrganizationSettingsScope } from "./organization-settings-scope";
import { CompanionSettings } from "./companion-settings";
import { ChatAutomationSettings } from "./chat-automation-settings";
import { WorkflowBuilderSettings } from "./workflow-builder-settings";
import { SidebarNavigationSettings } from "./sidebar-navigation-settings";

export function OrganizationCustomization() {
  const t = useTranslations("settings.organizationCustomization");
  return (
    <OrganizationSettingsScope
      title={t("title")}
      description={t("description")}
    >
      {(organization, refresh) => (
        <>
          <OrganizationBrandingCard onSaved={refresh} />
          {organization.canManageSettings ? (
            <>
              <ChatAutomationSettings />
              <SidebarNavigationSettings />
              <WorkflowBuilderSettings />
              <CompanionSettings />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("readOnly")}</p>
          )}
        </>
      )}
    </OrganizationSettingsScope>
  );
}
