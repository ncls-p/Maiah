import { PlusIcon } from "lucide-react";

import { ResourceShareDialog } from "@/components/marketplace/resource-share-dialog";
import { Button } from "@/components/ui/button";
import { WorkspacePage } from "@/components/workspace-page";
import type { useAgentsPageController } from "./page.agents-page";
import { AgentsPageSection1 } from "./page.agents-page.view.section-1";
import { AgentsPageSection2 } from "./page.agents-page.view.section-2";
import { ICON_SIZE_CLASS } from "./page.icon-size-class";

export type AgentsPageViewModel = Extract<
  ReturnType<typeof useAgentsPageController>,
  { kind: "ready" }
>;
export function AgentsPageView({ model }: { model: AgentsPageViewModel }) {
  const {
    agents,
    canCreateAgent,
    loading,
    setShareResource,
    setShowCreateDialog,
    shareResource,
    t,
    workspaceId,
  } = model;
  return (
    <WorkspacePage
      title={t("orbitTitle")}
      accentTitle={t("orbitAccent")}
      eyebrow={t("orbitEyebrow")}
      description={t("orbitDescription")}
      width="default"
      actions={
        canCreateAgent && !loading && agents.length > 0 ? (
          <Button size="sm" onClick={() => setShowCreateDialog(true)}>
            <PlusIcon className={ICON_SIZE_CLASS} aria-hidden="true" />
            {t("create")}
          </Button>
        ) : null
      }
    >
      <AgentsPageSection2 model={model} />

      {/* Create dialog */}
      <AgentsPageSection1 model={model} />

      <ResourceShareDialog
        resource={shareResource}
        workspaceId={workspaceId}
        open={shareResource !== null}
        onCloseAction={() => setShareResource(null)}
      />
    </WorkspacePage>
  );
}
