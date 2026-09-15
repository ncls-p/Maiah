"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchJson } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { organizationLabels } from "./organization-labels";
import { GovernanceSelect } from "./governance-select";
export type DirectoryOrganization = {
  id: string;
  name: string;
  canCreateProject: boolean;
  canManageMembers: boolean;
  projects: { id: string; name: string }[];
};
export function OrganizationDirectory() {
  const t = useTranslations("governance");
  const workspace = useWorkspace();
  const [rows, setRows] = useState<DirectoryOrganization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [projectName, setProjectName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetchJson<{ organizations: DirectoryOrganization[] }>(
      "/api/organizations",
      { signal: controller.signal },
    )
      .then((data) => {
        setRows([
          ...new Map(
            data.organizations.map((row) => [
              row.id,
              {
                ...row,
                projects: [
                  ...new Map(
                    row.projects.map((project) => [project.id, project]),
                  ).values(),
                ],
              },
            ]),
          ).values(),
        ]);
        setError("");
        setLoading(false);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setError(error.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [revision]);
  async function save(
    action: "createOrganization" | "createProject" | "addMember",
  ) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const result = await fetchJson<{
        project?: { id: string };
        organization?: { id: string };
      }>("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "createOrganization"
            ? { action, name }
            : action === "createProject"
              ? {
                  action,
                  name: projectName,
                  organizationId: selectedOrganizationId,
                }
              : { action, email, organizationId: selectedOrganizationId },
        ),
      });
      setRevision((value) => value + 1);
      await workspace.refresh();
      if (result.project) workspace.setWorkspaceId(result.project.id);
      if (result.organization) setOrganizationId(result.organization.id);
      setEmail("");
      setName("");
      setProjectName("");
    } catch (error) {
      setError(error instanceof Error ? error.message : t("error"));
    } finally {
      setPending(false);
    }
  }
  const activeOrganizationId = workspace.workspaces.find(
    (project) => project.id === workspace.workspaceId,
  )?.organizationId;
  const selectedOrganizationId =
    (rows.some((row) => row.id === organizationId)
      ? organizationId
      : undefined) ||
    (rows.some((row) => row.id === activeOrganizationId)
      ? activeOrganizationId
      : undefined) ||
    rows[0]?.id ||
    "";
  const selected = rows.find((row) => row.id === selectedOrganizationId);
  return (
    <section
      className="rounded-xl border bg-card p-4 sm:p-6"
      aria-label={t("organizations")}
    >
      <h2 className="text-base font-semibold">{t("organizations")}</h2>
      <div className="mt-4 flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {t("organizationsHint")}
        </p>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {error}
              <Button
                variant="outline"
                onClick={() => {
                  setLoading(true);
                  setRevision((value) => value + 1);
                }}
              >
                {t("retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        <form
          aria-label={t("createOrganization")}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void save("createOrganization");
          }}
        >
          <Field className="flex-1">
            <FieldLabel htmlFor="standalone-organization-name">
              {t("newOrganizationName")}
            </FieldLabel>
            <Input
              id="standalone-organization-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
              disabled={pending}
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {t("createOrganization")}
          </Button>
        </form>
        {loading ? (
          <p role="status">{t("loading")}</p>
        ) : (
          <>
            <GovernanceSelect
              label={t("organization")}
              value={selectedOrganizationId}
              onChange={setOrganizationId}
              options={organizationLabels(rows)}
              disabled={pending}
            />
            {new Set(rows.map((row) => row.name)).size < rows.length ? (
              <p className="text-sm text-muted-foreground">
                {t("homonymousOrganizations")}
              </p>
            ) : null}
            {selected ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {selected.projects.length
                    ? t("projectCount", { count: selected.projects.length })
                    : t("noProjects")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {selected.projects.map((project) => (
                    <Button
                      key={project.id}
                      variant="outline"
                      onClick={() => workspace.setWorkspaceId(project.id)}
                    >
                      {project.name}
                    </Button>
                  ))}
                </div>
                {selected.canManageMembers ? (
                  <form
                    className="flex flex-col gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void save("addMember");
                    }}
                  >
                    <Field>
                      <FieldLabel htmlFor="organization-member-email">
                        {t("memberEmail")}
                      </FieldLabel>
                      <Input
                        id="organization-member-email"
                        type="email"
                        required
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        disabled={pending}
                      />
                    </Field>
                    <Button type="submit" disabled={pending}>
                      {t("addMember")}
                    </Button>
                  </form>
                ) : null}
                {selected.canCreateProject ? (
                  <form
                    className="flex flex-col gap-3 sm:flex-row sm:items-end"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void save("createProject");
                    }}
                  >
                    <Field className="flex-1">
                      <FieldLabel htmlFor="organization-project-name">
                        {t("projectName")}
                      </FieldLabel>
                      <Input
                        id="organization-project-name"
                        value={projectName}
                        onChange={(event) => setProjectName(event.target.value)}
                        required
                        minLength={2}
                        disabled={pending}
                      />
                    </Field>
                    <Button type="submit" disabled={pending}>
                      {t("addProject")}
                    </Button>
                  </form>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
