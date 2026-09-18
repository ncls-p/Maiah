"use client";

import { useTranslations } from "next-intl";
import { GenesysConnectionPanel } from "@/components/iam/genesys-connection-panel";
import { MicrosoftSsoSettings } from "./microsoft-sso-settings";
import { OrganizationSettingsScope } from "./organization-settings-scope";

export function OrganizationConnections() {
  const t = useTranslations("connections");
  return (
    <OrganizationSettingsScope
      title={t("organization")}
      description={t("scope")}
    >
      {(organization) =>
        organization.canManageSettings ? (
          <div className="flex flex-col gap-6" key={organization.id}>
            <MicrosoftSsoSettings />
            <GenesysConnectionPanel
              organizationId={organization.id}
              projects={organization.projects}
            />
          </div>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            {t("readOnly")}
          </p>
        )
      }
    </OrganizationSettingsScope>
  );
}
