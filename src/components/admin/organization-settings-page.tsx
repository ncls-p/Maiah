"use client";

import { useTranslations } from "next-intl";
import { OrganizationBrandingCard } from "@/app/[locale]/(workspace)/admin/settings/organization-branding-card";
import { OrganizationSettingsScope } from "./organization-settings-scope";
import { CompanionSettings } from "./companion-settings";
import { ChatAutomationSettings } from "./chat-automation-settings";
import { WorkflowBuilderSettings } from "./workflow-builder-settings";
import { SidebarNavigationSettings } from "./sidebar-navigation-settings";
import type { OrganizationSettingsSection } from "./settings-navigation";

export function OrganizationSettingsPage({
  section,
}: {
  section: OrganizationSettingsSection;
}) {
  const t = useTranslations("connections");
  const components = {
    chat: ChatAutomationSettings,
    navigation: SidebarNavigationSettings,
    workflows: WorkflowBuilderSettings,
    companion: CompanionSettings,
  };
  const Component =
    section in components
      ? components[section as keyof typeof components]
      : null;
  return (
    <OrganizationSettingsScope
      title={t("organization")}
      description={t("scope")}
    >
      {(organization, refresh) =>
        section === "branding" ? (
          <OrganizationBrandingCard onSaved={refresh} />
        ) : organization.canManageSettings && Component ? (
          <Component />
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            {t("readOnly")}
          </p>
        )
      }
    </OrganizationSettingsScope>
  );
}
