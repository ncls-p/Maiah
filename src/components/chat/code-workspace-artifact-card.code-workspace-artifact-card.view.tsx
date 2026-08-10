import { GitHubPublishDialog } from "@/components/chat/github-publish-dialog";
import { DestructiveConfirmationDialog } from "@/components/destructive-confirmation-dialog";
import { cn } from "@/lib/utils";
import type { useCodeWorkspaceArtifactCardController } from "./code-workspace-artifact-card.code-workspace-artifact-card";
import { CodeWorkspaceArtifactCardSection1 } from "./code-workspace-artifact-card.code-workspace-artifact-card.view.section-1";
import { CodeWorkspaceArtifactCardSection2 } from "./code-workspace-artifact-card.code-workspace-artifact-card.view.section-2";
import { CodeWorkspaceArtifactCardSection3 } from "./code-workspace-artifact-card.code-workspace-artifact-card.view.section-3";

export type CodeWorkspaceArtifactCardViewModel = Extract<
  ReturnType<typeof useCodeWorkspaceArtifactCardController>,
  { kind: "ready" }
>;
export function CodeWorkspaceArtifactCardView({
  model,
}: {
  model: CodeWorkspaceArtifactCardViewModel;
}) {
  const {
    currentArtifact,
    deletePath,
    deleteSelectedFile,
    publishOpen,
    savingFile,
    setDeletePath,
    setPublishOpen,
    t,
    variant,
    workspaceId,
  } = model;
  return (
    <>
      <GitHubPublishDialog
        artifact={currentArtifact}
        workspaceId={workspaceId}
        open={publishOpen}
        onOpenChangeAction={setPublishOpen}
      />
      <div
        className={cn(
          "overflow-hidden rounded-2xl bg-card text-xs shadow-[var(--surface-shadow)]",
          variant === "workbench" &&
            "flex h-full min-h-0 flex-col rounded-none border-0 shadow-none",
        )}
      >
        <CodeWorkspaceArtifactCardSection3 model={model} />
        {currentArtifact.message ? (
          <div className="border-b border-border/40 px-3 py-2 text-[11px] text-muted-foreground">
            {currentArtifact.message}
          </div>
        ) : null}
        <CodeWorkspaceArtifactCardSection2 model={model} />
        <CodeWorkspaceArtifactCardSection1 model={model} />
      </div>
      <DestructiveConfirmationDialog
        open={deletePath !== null}
        title={t("deleteFile")}
        description={t("deleteFileConfirm", { path: deletePath ?? "" })}
        cancelLabel={t("cancel")}
        confirmLabel={savingFile ? t("deletingFile") : t("deleteFile")}
        busy={savingFile}
        onOpenChange={(open) => {
          if (!open && !savingFile) setDeletePath(null);
        }}
        onConfirm={() => void deleteSelectedFile()}
      />
    </>
  );
}
