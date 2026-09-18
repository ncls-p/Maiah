"use client";
import { MicrosoftSsoSettings } from "./microsoft-sso-settings";
import { CompanionSettings } from "./companion-settings";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchJson } from "@/lib/api-client";
import { GovernanceSelect } from "@/components/iam/governance-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { OrganizationBrandingCard } from "@/app/[locale]/(workspace)/admin/settings/organization-branding-card";
import { ChatAutomationSettings } from "./chat-automation-settings";
import { WorkflowBuilderSettings } from "./workflow-builder-settings";
import { SidebarNavigationSettings } from "./sidebar-navigation-settings";

import { organizationLabels } from "@/components/iam/organization-labels";
import { OrganizationSettingsContext } from "./organization-settings-context";

type Organization = {
  id: string;
  name: string;
  canManageSettings: boolean;
  projects: { id: string; name: string }[];
};
export function OrganizationCustomization() {
  const t = useTranslations("settings.organizationCustomization");
  const { workspaceId, workspaces } = useWorkspace();
  const activeOrganization = workspaces.find(
    (project) => project.id === workspaceId,
  )?.organizationId;
  const [selection, setSelection] = useState<{
    id: string;
    context: string | undefined;
  } | null>(null);
  const selectedId =
    selection?.context === activeOrganization ? selection?.id : null;
  const [rows, setRows] = useState<Organization[] | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetchJson<{ organizations: Organization[] }>("/api/organizations", {
      signal: controller.signal,
    })
      .then((data) => {
        setRows(data.organizations);
        setError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [revision, workspaceId]);
  const organization =
    rows?.find((row) => row.id === (selectedId ?? activeOrganization)) ??
    rows?.[0];
  return (
    <section className="flex flex-col gap-5" aria-label={t("title")}>
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="mt-2 mb-4 text-sm text-muted-foreground">
          {t("description")}
        </p>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {error}
              <Button onClick={() => setRevision((value) => value + 1)}>
                {t("retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {rows ? (
          <GovernanceSelect
            label={t("organization")}
            value={organization?.id ?? ""}
            options={organizationLabels(rows)}
            onChange={(id) => setSelection({ id, context: activeOrganization })}
          />
        ) : (
          <p role="status">{t("loading")}</p>
        )}
      </div>
      {organization ? (
        <OrganizationSettingsContext.Provider
          key={organization.id}
          value={organization.id}
        >
          <OrganizationBrandingCard
            onSaved={() => setRevision((value) => value + 1)}
          />
          {organization.canManageSettings ? (
            <>
              <MicrosoftSsoSettings />
              <ChatAutomationSettings />
              <SidebarNavigationSettings />
              <WorkflowBuilderSettings />
              <CompanionSettings />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("readOnly")}</p>
          )}
        </OrganizationSettingsContext.Provider>
      ) : null}
    </section>
  );
}
