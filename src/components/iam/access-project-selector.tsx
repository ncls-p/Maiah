"use client";

import { useTranslations } from "next-intl";
import { useWorkspace } from "@/hooks/use-workspace";
import { GovernanceSelect } from "./governance-select";
import { organizationLabels, projectLabels } from "./organization-labels";

export function AccessProjectSelector({
  onOrganizationChange,
}: {
  onOrganizationChange?: () => void;
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
  return (
    <div className="flex w-full flex-wrap items-end gap-3">
      <div className="min-w-0 w-full sm:w-56">
        <GovernanceSelect
          label={t("filters.organization")}
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
      </div>
      <div className="min-w-0 flex-1 sm:max-w-md">
        <GovernanceSelect
          label={t("activeProject")}
          value={workspaceId ?? ""}
          options={projectLabels(projects)}
          disabled={isLoading || !projects.length}
          onChange={(id) => {
            if (projects.some((project) => project.id === id))
              void setWorkspaceId(id);
          }}
        />
      </div>
    </div>
  );
}
