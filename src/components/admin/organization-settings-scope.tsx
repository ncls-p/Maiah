"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchJson } from "@/lib/api-client";
import { GovernanceSelect } from "@/components/iam/governance-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { organizationLabels } from "@/components/iam/organization-labels";
import { OrganizationSettingsContext } from "./organization-settings-context";

type Organization = {
  id: string;
  name: string;
  canManageSettings: boolean;
  projects: { id: string; name: string }[];
};
export function OrganizationSettingsScope({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: (organization: Organization, refresh: () => void) => ReactNode;
}) {
  const t = useTranslations("settings.organizationCustomization");
  const tScope = useTranslations("admin.scope");
  const { workspaceId, workspaces } = useWorkspace();
  const activeOrganization = workspaces.find(
    (project) => project.id === workspaceId,
  )?.organizationId;
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const selectedId = searchParams.get("organizationId");
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
  const organization = selectedId
    ? rows?.find((row) => row.id === selectedId)
    : (rows?.find((row) => row.id === activeOrganization) ?? rows?.[0]);
  return (
    <section className="flex flex-col gap-5" aria-label={title}>
      <div className="rounded-xl border bg-card p-5">
        <p className="sr-only">{description}</p>
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
            onChange={(id) => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("organizationId", id);
              router.replace(`${pathname}?${params}`, { scroll: false });
            }}
          />
        ) : !error ? (
          <p role="status">{t("loading")}</p>
        ) : null}
        {rows && !organization && !error ? (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            {selectedId ? tScope("unavailable") : tScope("empty")}
          </p>
        ) : null}
      </div>
      {organization && !error ? (
        <OrganizationSettingsContext.Provider
          key={organization.id}
          value={organization.id}
        >
          {children(organization, () => setRevision((value) => value + 1))}
        </OrganizationSettingsContext.Provider>
      ) : null}
    </section>
  );
}
