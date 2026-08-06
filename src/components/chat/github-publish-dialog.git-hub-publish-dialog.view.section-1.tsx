import { RefreshCcwIcon,SettingsIcon,UploadCloudIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DialogContent,DialogDescription,DialogTitle } from "@/components/ui/dialog";
import { BUTTON_TYPE,GithubIcon,OUTLINE_VARIANT,formatLastSynced,hasLimitedRepositoryAccess } from "./github-publish-dialog.button-type";
import type { GitHubPublishDialogViewModel } from "./github-publish-dialog.git-hub-publish-dialog.view";

export function GitHubPublishDialogSection1({ model }: { model: GitHubPublishDialogViewModel }) {
  const { artifact, branches, canPublishToSelectedRepository, commitMessage, configured, confirmDirectPush, connectUrl, connections, error, loading, locale, mode, onOpenChangeAction, primaryManageUrl, publish, publishing, repositories, repositoryId, result, selectedConnection, selectedRepository, setCommitMessage, setConfirmDirectPush, setMode, setRepositoryId, setSourceBranch, setTargetBranch, setTargetDirectory, sourceBranch, syncRepositories, syncing, t, targetBranch, targetDirectory, workspaceId } = model;
  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <DialogTitle>{t("title")}</DialogTitle>
      <DialogDescription>{t("dialogDescription")}</DialogDescription>
      {!workspaceId ? (
        <p className="text-sm text-muted-foreground">{t("workspaceRequired")}</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : !configured ? (
        <p className="text-sm text-muted-foreground">{t("notConfigured")}</p>
      ) : repositories.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("connectDescription")}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild disabled={!connectUrl}>
              <a href={connectUrl ?? "#"}>
                <GithubIcon className="size-4" aria-hidden="true" />
                {t("connect")}
              </a>
            </Button>
            <Button type={BUTTON_TYPE} variant={OUTLINE_VARIANT} disabled={syncing || connections.length === 0} onClick={() => void syncRepositories()}>
              <RefreshCcwIcon className="size-4" aria-hidden="true" />
              {syncing ? t("syncing") : t("syncExisting")}
            </Button>
            <Button asChild variant={OUTLINE_VARIANT} disabled={!primaryManageUrl}>
              <a href={primaryManageUrl ?? "#"} target="_blank" rel="noreferrer">
                <SettingsIcon className="size-4" aria-hidden="true" />
                {t("manageRepos")}
              </a>
            </Button>
          </div>
        </div>
      ) : result ? (
        <div className="space-y-3 text-sm">
          <p className="font-medium text-foreground">{result.message}</p>
          <p className="text-muted-foreground">
            {t("publishResult", {
              sha: result.commitSha.slice(0, 7),
              repository: result.repository,
              branch: result.targetBranch,
            })}
          </p>
          {result.pullRequestUrl ? (
            <Button asChild>
              <a href={result.pullRequestUrl} target="_blank" rel="noreferrer">
                {t("openPullRequest")}
              </a>
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-foreground">{selectedConnection ? `${selectedConnection.accountLogin}${selectedConnection.accountType ? ` · ${selectedConnection.accountType}` : ""}` : t("repositories")}</p>
                <p className="mt-1">
                  {selectedConnection
                    ? formatLastSynced(selectedConnection.lastSyncedAt, locale, t)
                    : t("authorizedRepositories", {
                        count: repositories.length,
                      })}
                </p>
                <p className="mt-1">{t("repositoryListDescription")}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button type={BUTTON_TYPE} variant={OUTLINE_VARIANT} size="sm" disabled={syncing} onClick={() => void syncRepositories(selectedConnection?.id)}>
                  <RefreshCcwIcon className="size-3" aria-hidden="true" />
                  {syncing ? t("syncing") : t("sync")}
                </Button>
                <Button asChild variant={OUTLINE_VARIANT} size="sm" disabled={!primaryManageUrl}>
                  <a href={primaryManageUrl ?? "#"} target="_blank" rel="noreferrer">
                    <SettingsIcon className="size-3" aria-hidden="true" />
                    {t("manageRepos")}
                  </a>
                </Button>
                {connectUrl ? (
                  <Button asChild variant="ghost" size="sm">
                    <a href={connectUrl}>
                      <GithubIcon className="size-3" aria-hidden="true" />
                      {t("addAccount")}
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
          {selectedRepository && hasLimitedRepositoryAccess(selectedRepository.access) ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">
                {t("limitedAccess", {
                  access: t(`access.${selectedRepository.access}`),
                })}
              </p>
              <p className="mt-1">{t("grantAccessDescription")}</p>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <label className="text-xs font-medium" htmlFor="github-repo">
              {t("repository")}
            </label>
            <select
              id="github-repo"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={repositoryId}
              onChange={(event) => {
                setRepositoryId(event.target.value);
                const repo = repositories.find((item) => item.id === event.target.value);
                setTargetBranch(repo?.defaultBranch || "main");
              }}
            >
              {repositories.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.fullName}
                  {repo.private ? ` · ${t("private")}` : ""}
                  {repo.relationship === "collaborator" ? ` · ${t("collaborator")}` : ""}
                  {hasLimitedRepositoryAccess(repo.access) ? ` · ${t(`access.${repo.access}`)}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs font-medium" htmlFor="github-mode">
              {t("mode")}
            </label>
            <select
              id="github-mode"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={mode}
              onChange={(event) => {
                setMode(event.target.value as "pull_request" | "direct_push");
                setConfirmDirectPush(false);
              }}
            >
              <option value="pull_request">{t("pullRequestMode")}</option>
              <option value="direct_push">{t("directPushMode")}</option>
            </select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs font-medium" htmlFor="github-branch">
              {t("targetBranch")}
            </label>
            <input id="github-branch" list="github-branches" className="h-9 rounded-md border bg-background px-2 text-sm" value={targetBranch} onChange={(event) => setTargetBranch(event.target.value)} />
            <datalist id="github-branches">
              {branches.map((branch) => (
                <option key={branch.name} value={branch.name} />
              ))}
            </datalist>
            {targetBranch === selectedRepository?.defaultBranch ? <p className="text-[11px] text-muted-foreground">{t("defaultBranch", { name: selectedRepository.fullName })}</p> : null}
          </div>
          {mode === "pull_request" ? (
            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="github-source">
                {t("sourceBranch")}
              </label>
              <input id="github-source" className="h-9 rounded-md border bg-background px-2 text-sm" placeholder="ai-hub/update-page" value={sourceBranch} onChange={(event) => setSourceBranch(event.target.value)} />
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <label className="text-xs font-medium" htmlFor="github-dir">
              {t("targetDirectory")}
            </label>
            <input id="github-dir" className="h-9 rounded-md border bg-background px-2 text-sm" placeholder="public/site" value={targetDirectory} onChange={(event) => setTargetDirectory(event.target.value)} />
            <p className="text-[11px] text-muted-foreground">{t("targetDirectoryHint")}</p>
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs font-medium" htmlFor="github-commit">
              {t("commitMessage")}
            </label>
            <input id="github-commit" className="h-9 rounded-md border bg-background px-2 text-sm" value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} />
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-[11px] text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">{t("filesToPublish")}</p>
            <p>
              {t("filesSummary", {
                count: artifact.files.length,
                version: artifact.version,
              })}
            </p>
          </div>
          {mode === "direct_push" ? (
            <label className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
              <input type="checkbox" checked={confirmDirectPush} onChange={(event) => setConfirmDirectPush(event.target.checked)} />
              <span>
                {t.rich("directPushConfirmation", {
                  branch: targetBranch || t("thisBranch"),
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </span>
            </label>
          ) : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type={BUTTON_TYPE} variant={OUTLINE_VARIANT} onClick={() => onOpenChangeAction(false)}>
              {t("cancel")}
            </Button>
            <Button type={BUTTON_TYPE} disabled={publishing || !repositoryId || !canPublishToSelectedRepository || !targetBranch.trim() || !commitMessage.trim() || (mode === "direct_push" && !confirmDirectPush)} onClick={() => void publish()}>
              <UploadCloudIcon className="size-4" aria-hidden="true" />
              {publishing ? t("publishing") : t("publish")}
            </Button>
          </div>
        </div>
      )}
      {error && (loading || repositories.length === 0) ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}
    </DialogContent>
  );
}
