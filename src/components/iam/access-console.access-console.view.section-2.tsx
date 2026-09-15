import { AccessProjectSelector } from "./access-project-selector";
import { ProjectTransferDialog } from "./project-transfer-dialog";
import { ChevronDownIcon, Settings2Icon } from "lucide-react";

import { ScopeLifecycleDialog } from "@/components/iam/scope-lifecycle-dialog";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
export function AccessConsoleSection2({
  model,
}: {
  model: AccessConsoleViewModel;
}) {
  const {
    canManageOrganizationLifecycle,
    canManageProjectLifecycle,
    load,
    snapshot,
    t,
    workspaceId,
  } = model;
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
      <AccessProjectSelector
        onOrganizationChange={() => {
          model.setPeopleTeamId("all");
          model.setPeopleProjectOnly(false);
          model.setSelectedPeople([]);
        }}
      />

      <Collapsible className="w-full">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="group">
            <Settings2Icon data-icon="inline-start" aria-hidden="true" />
            {t("simpleAccess.projectSettings")}
            <ChevronDownIcon
              data-icon="inline-end"
              aria-hidden="true"
              className="group-data-[state=open]:rotate-180"
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <p className="max-w-md py-2 text-sm text-muted-foreground">
            {snapshot.organization.name} · {t("inheritanceHint")}
          </p>
          <div className="flex flex-wrap gap-2 py-2">
            {snapshot.actions.workspace["workspaces.transfer"] &&
            snapshot.actions.organization["organization.transfer"] ? (
              <ProjectTransferDialog
                workspaceId={workspaceId}
                workspaceName={snapshot.activeProject.name}
                organizationName={snapshot.organization.name}
                onTransferred={() => load({ preserveData: true })}
              />
            ) : null}
            {canManageProjectLifecycle ||
            canManageOrganizationLifecycle ||
            snapshot.actions.workspace["workspaces.delete"] ||
            snapshot.actions.organization["organization.delete"] ? (
              <ScopeLifecycleDialog
                organization={snapshot.organization}
                project={snapshot.activeProject}
                canManageProject={canManageProjectLifecycle}
                canManageOrganization={canManageOrganizationLifecycle}
                canDeleteProject={
                  snapshot.actions.workspace["workspaces.delete"]
                }
                canDeleteOrganization={
                  snapshot.actions.organization["organization.delete"]
                }
                onRenamed={() => load({ preserveData: true })}
              />
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
