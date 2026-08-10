import { Dialog } from "@/components/ui/dialog";
import type { useGitHubPublishDialogController } from "./github-publish-dialog.git-hub-publish-dialog";
import { GitHubPublishDialogSection1 } from "./github-publish-dialog.git-hub-publish-dialog.view.section-1";

export type GitHubPublishDialogViewModel = Extract<
  ReturnType<typeof useGitHubPublishDialogController>,
  { kind: "ready" }
>;
export function GitHubPublishDialogView({
  model,
}: {
  model: GitHubPublishDialogViewModel;
}) {
  const { onOpenChangeAction, open } = model;
  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <GitHubPublishDialogSection1 model={model} />
    </Dialog>
  );
}
