import { ScopeMigrationDialog } from "@/components/iam/scope-migration-dialog";
import type { useResourceAccessPanelController } from "./access-console.resource-access-panel";
import { ResourceAccessPanelSection1 } from "./access-console.resource-access-panel.view.section-1";
import { ResourceAccessPanelSection2 } from "./access-console.resource-access-panel.view.section-2";
import { ResourceAccessPanelSection3 } from "./access-console.resource-access-panel.view.section-3";
import { ResourceAccessPanelSection4 } from "./access-console.resource-access-panel.view.section-4";

export type ResourceAccessPanelViewModel = Extract<
  ReturnType<typeof useResourceAccessPanelController>,
  { kind: "ready" }
>;
export function ResourceAccessPanelView({
  model,
}: {
  model: ResourceAccessPanelViewModel;
}) {
  const { canManageResources, t, workspaceId } = model;
  return (
    <div className="flex flex-col gap-4">
      <ResourceAccessPanelSection4
        model={model}
        toolbar={
          canManageResources ? (
            <details>
              <summary className="cursor-pointer py-2 text-sm text-muted-foreground">
                {t("simpleAccess.advancedActions")}
              </summary>
              <div className="pt-2">
                <ScopeMigrationDialog workspaceId={workspaceId} />
              </div>
            </details>
          ) : null
        }
      />
      <ResourceAccessPanelSection3 model={model} />
      <ResourceAccessPanelSection2 model={model} />
      <ResourceAccessPanelSection1 model={model} />
    </div>
  );
}
