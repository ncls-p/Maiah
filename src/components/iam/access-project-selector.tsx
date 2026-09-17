"use client";

import { useTranslations } from "next-intl";
import { useWorkspace } from "@/hooks/use-workspace";
import { GovernanceSelect } from "./governance-select";
import { organizationLabels, projectLabels } from "./organization-labels";

export function AccessProjectSelector({
  onOrganizationChange,
  variant = "form",
}: {
  onOrganizationChange?: () => void;
  variant?: "form" | "breadcrumb";
}) {
  const t = useTranslations("access");
  const { workspaceId, workspaces, setWorkspaceId, isLoading } = useWorkspace();
  const uniqueProjects = [
    ...new Map(workspaces.map((project) => [project.id, project])).values(),
  ];
  const organizationId = uniqueProjects.find(
    (project) => project.id === workspaceId,
  )?.organizationId;
  const organizations = [
    ...new Map(
      uniqueProjects.map((project) => [
        project.organizationId,
        {
          id: project.organizationId,
          name: project.organizationName,
          projects: uniqueProjects.filter(
            (item) => item.organizationId === project.organizationId,
          ),
        },
      ]),
    ).values(),
  ];
  const projects = uniqueProjects.filter(
    (project) => project.organizationId === organizationId,
  );
  const organizationSelect = (
    <GovernanceSelect
      label={t("filters.organization")}
      hideLabel={variant === "breadcrumb"}
      value={organizationId ?? ""}
      options={organizationLabels(organizations)}
      disabled={isLoading}
      onChange={(id) => {
        const project = uniqueProjects.find(
          (project) => project.organizationId === id,
        );
        if (project) {
          onOrganizationChange?.();
          void setWorkspaceId(project.id);
        }
      }}
    />
  );
  const projectSelect = (
    <GovernanceSelect
      label={t("activeProject")}
      hideLabel={variant === "breadcrumb"}
      value={workspaceId ?? ""}
      options={projectLabels(projects)}
      disabled={isLoading || !projects.length}
      onChange={(id) => {
        if (projects.some((project) => project.id === id))
          void setWorkspaceId(id);
      }}
    />
  );
  if (variant === "breadcrumb") {
    return (
      <nav
        aria-label={t("activeProject")}
        className="flex min-w-0 flex-wrap items-center gap-2"
      >
        <div className="min-w-0 w-full sm:w-44">{organizationSelect}</div>
        <span
          aria-hidden="true"
          className="hidden text-muted-foreground sm:inline"
        >
          ›
        </span>
        <div className="min-w-0 flex-1 sm:max-w-md">{projectSelect}</div>
      </nav>
    );
  }
  return (
    <div className="flex w-full flex-wrap items-end gap-3">
      <div className="min-w-0 w-full sm:w-56">{organizationSelect}</div>
      <div className="min-w-0 flex-1 sm:max-w-md">{projectSelect}</div>
    </div>
  );
}
