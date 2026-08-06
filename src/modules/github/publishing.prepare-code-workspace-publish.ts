import { getCodeWorkspaceFilesForPublish } from "@/modules/code-workspace/storage";
import { assertPublishPathAllowed,commonWorkspaceDirectory,scanTextForSecrets,workspaceContentPath } from "./publishing.common-workspace-directory";
import { canAttemptGitHubRepositoryPublish,normalizePermissions } from "./publishing.create-git-hub-state";
import { getInstallationToken,githubPublishLog,maxCommitBytes,maxCommitFiles,publishInputSchema,type PublishCodeWorkspaceInput } from "./publishing.git-hub-repository-summary";
import { assertSafeBranchName,getUserRepository,normalizeTargetDirectory,prefixedPath } from "./publishing.sync-git-hub-installation";

export async function prepareCodeWorkspacePublish(input: PublishCodeWorkspaceInput) {
  const parsed = publishInputSchema.parse(input);
  if (parsed.mode === "direct_push" && !parsed.confirmDirectPush) {
    throw new Error("Direct push requires explicit user confirmation.");
  }
  const targetBranch = assertSafeBranchName(parsed.targetBranch);
  const targetDirectory = normalizeTargetDirectory(parsed.targetDirectory);
  const { repo, connection } = await getUserRepository({
    userId: parsed.userId,
    repositoryId: parsed.repositoryId,
  });
  if (!canAttemptGitHubRepositoryPublish(normalizePermissions(repo.permissionsJson))) {
    throw new Error("GitHub repository write access is required before publishing.");
  }
  const workspace = await getCodeWorkspaceFilesForPublish({
    projectId: parsed.projectId,
    workspaceId: parsed.workspaceId,
    userId: parsed.userId,
  });
  if (workspace.files.length > maxCommitFiles) {
    throw new Error(`Too many files to publish. Maximum is ${maxCommitFiles}.`);
  }
  const totalBytes = workspace.files.reduce((total, file) => total + file.bytes.byteLength, 0);
  if (totalBytes > maxCommitBytes) {
    throw new Error("Code workspace is too large to publish. Maximum is 50 MB.");
  }
  const workspaceDirectory = commonWorkspaceDirectory(workspace.files.map((file) => file.path));
  const repositoryPath = (filePath: string) => prefixedPath(targetDirectory, workspaceContentPath(workspaceDirectory, filePath));
  for (const file of workspace.files) {
    const publishPath = repositoryPath(file.path);
    assertPublishPathAllowed(publishPath);
    scanTextForSecrets(publishPath, file.bytes);
  }
  
  const token = await getInstallationToken(connection.installationId);
  let sourceBranch = parsed.mode === "pull_request" ? parsed.sourceBranch?.trim() || `ai-hub/${workspace.metadata.id.slice(0, 8)}-${Date.now().toString(36)}` : targetBranch;
  sourceBranch = assertSafeBranchName(sourceBranch);
  const logContext = {
    workspaceId: parsed.workspaceId,
    userId: parsed.userId,
    codeWorkspaceId: workspace.metadata.id,
    repository: repo.fullName,
    mode: parsed.mode,
    targetBranch,
    sourceBranch,
    targetDirectory: targetDirectory || null,
    fileCount: workspace.files.length,
    totalBytes,
  };
  githubPublishLog("start", logContext);
  return { parsed, targetBranch, targetDirectory, repo, connection, workspace, repositoryPath, token, sourceBranch, logContext };
}
