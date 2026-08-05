import { getCodeWorkspaceFilesForPublish } from "@/modules/code-workspace/storage";
import { db } from "@/server/infrastructure/db";
import { githubPublishEvents } from "@/server/infrastructure/db/schema";
import { assertPublishPathAllowed,commonWorkspaceDirectory,createGitRef,getCommitTreeSha,getGitRef,gitRefExists,initializeEmptyRepository,isEmptyGitRepositoryError,scanTextForSecrets,workspaceContentPath } from "./publishing.common-workspace-directory";
import { canAttemptGitHubRepositoryPublish,normalizePermissions } from "./publishing.create-git-hub-state";
import { GitHubPublishResult,PublishCodeWorkspaceInput,getInstallationToken,githubPublishLog,githubRequest,maxCommitBytes,maxCommitFiles,publishInputSchema } from "./publishing.git-hub-repository-summary";
import { publishEmptyRepositoryDirectPush } from "./publishing.publish-empty-repository-direct-push";
import { assertSafeBranchName,encodeRefPath,getUserRepository,normalizeTargetDirectory,prefixedPath } from "./publishing.sync-git-hub-installation";

export async function publishCodeWorkspaceToGitHub(input: PublishCodeWorkspaceInput): Promise<GitHubPublishResult> {
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
  let eventId: string | null = null;
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

  try {
    let baseCommitSha: string | null = null;
    let baseTreeSha: string | null = null;
    try {
      githubPublishLog("target-ref-load-start", logContext);
      const targetRef = await getGitRef({
        token,
        owner: repo.owner,
        repo: repo.name,
        branch: targetBranch,
      });
      baseCommitSha = targetRef.object.sha;
      baseTreeSha = await getCommitTreeSha({
        token,
        owner: repo.owner,
        repo: repo.name,
        commitSha: baseCommitSha,
      });
      githubPublishLog("target-ref-load-success", {
        ...logContext,
        baseCommitSha,
      });
    } catch (error) {
      if (!isEmptyGitRepositoryError(error)) throw error;
      githubPublishLog("empty-repository-detected", logContext);
      const firstFile = workspace.files[0];
      if (!firstFile) {
        throw new Error("No files available to publish.");
      }
      if (parsed.mode === "direct_push") {
        const published = await publishEmptyRepositoryDirectPush({
          token,
          owner: repo.owner,
          repo: repo.name,
          branch: targetBranch,
          files: workspace.files.map((file) => ({
            path: repositoryPath(file.path),
            bytes: file.bytes,
            size: file.size,
          })),
          commitMessage: parsed.commitMessage,
          logContext,
        });
        githubPublishLog("audit-log-write-start", logContext);
        const [event] = await db
          .insert(githubPublishEvents)
          .values({
            workspaceId: parsed.workspaceId,
            userId: parsed.userId,
            connectionId: connection.id,
            repositoryId: repo.id,
            codeWorkspaceId: workspace.metadata.id,
            conversationId: parsed.conversationId,
            agentId: parsed.agentId,
            mode: parsed.mode,
            targetBranch,
            sourceBranch,
            commitSha: published.commitSha,
            pullRequestUrl: null,
            status: "success",
            metadataJson: {
              targetDirectory,
              files: published.files.map((file) => file.path),
            },
          })
          .returning({ id: githubPublishEvents.id });
        eventId = event.id;
        githubPublishLog("success", {
          ...logContext,
          commitSha: published.commitSha,
          eventId,
        });
        return {
          kind: "github_publish_result",
          mode: parsed.mode,
          repository: repo.fullName,
          targetBranch,
          sourceBranch: null,
          commitSha: published.commitSha,
          pullRequestUrl: null,
          files: published.files,
          message: `Changes pushed to ${repo.fullName}:${targetBranch}.`,
        };
      }
      const initialPath = parsed.mode === "pull_request" ? "README.md" : repositoryPath(firstFile.path);
      const initialBytes = parsed.mode === "pull_request" ? Buffer.from("# Maiah publishing\n\nInitialized to enable publishing from Maiah.\n") : firstFile.bytes;
      const emptyBase = await initializeEmptyRepository({
        token,
        owner: repo.owner,
        repo: repo.name,
        branch: targetBranch,
        path: initialPath,
        bytes: initialBytes,
        logContext,
      });
      baseCommitSha = emptyBase.commitSha;
      baseTreeSha = emptyBase.treeSha;
    }

    if (parsed.mode === "pull_request") {
      if (!baseCommitSha) {
        throw new Error("Cannot create a pull request without a base branch.");
      }
      githubPublishLog("source-branch-check-start", logContext);
      if (
        await gitRefExists({
          token,
          owner: repo.owner,
          repo: repo.name,
          branch: sourceBranch,
        })
      ) {
        throw new Error(`Source branch already exists: ${sourceBranch}`);
      }
      githubPublishLog("source-branch-create-start", logContext);
      await createGitRef({
        token,
        owner: repo.owner,
        repo: repo.name,
        branch: sourceBranch,
        sha: baseCommitSha,
      });
      githubPublishLog("source-branch-create-success", logContext);
    }

    githubPublishLog("blobs-create-start", logContext);
    const treeItems = await Promise.all(
      workspace.files.map(async (file) => {
        const blob = await githubRequest<{ sha: string }>(`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/blobs`, token, {
          method: "POST",
          body: JSON.stringify({
            content: Buffer.from(file.bytes).toString("base64"),
            encoding: "base64",
          }),
        });
        return {
          path: repositoryPath(file.path),
          mode: "100644",
          type: "blob",
          sha: blob.sha,
        };
      }),
    );
    githubPublishLog("blobs-create-success", logContext);
    githubPublishLog("tree-create-start", logContext);
    const tree = await githubRequest<{ sha: string }>(`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/trees`, token, {
      method: "POST",
      body: JSON.stringify({
        ...(baseTreeSha ? { base_tree: baseTreeSha } : {}),
        tree: treeItems,
      }),
    });
    githubPublishLog("tree-create-success", {
      ...logContext,
      treeSha: tree.sha,
    });
    githubPublishLog("commit-create-start", logContext);
    const commit = await githubRequest<{ sha: string; html_url?: string }>(`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/commits`, token, {
      method: "POST",
      body: JSON.stringify({
        message: parsed.commitMessage,
        tree: tree.sha,
        parents: baseCommitSha ? [baseCommitSha] : [],
      }),
    });
    githubPublishLog("commit-create-success", {
      ...logContext,
      commitSha: commit.sha,
    });
    if (baseCommitSha) {
      githubPublishLog("ref-update-start", logContext);
      await githubRequest(`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/refs/heads/${encodeRefPath(sourceBranch)}`, token, {
        method: "PATCH",
        body: JSON.stringify({ sha: commit.sha, force: false }),
      });
      githubPublishLog("ref-update-success", logContext);
    } else {
      githubPublishLog("ref-create-start", logContext);
      await createGitRef({
        token,
        owner: repo.owner,
        repo: repo.name,
        branch: sourceBranch,
        sha: commit.sha,
      });
      githubPublishLog("ref-create-success", logContext);
    }

    let pullRequestUrl: string | null = null;
    if (parsed.mode === "pull_request") {
      githubPublishLog("pull-request-create-start", logContext);
      const pr = await githubRequest<{ html_url: string }>(`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/pulls`, token, {
        method: "POST",
        body: JSON.stringify({
          title: parsed.pullRequestTitle || parsed.commitMessage,
          head: sourceBranch,
          base: targetBranch,
          body: parsed.pullRequestBody || `Created by Maiah from code workspace ${workspace.metadata.id}.`,
        }),
      });
      pullRequestUrl = pr.html_url;
      githubPublishLog("pull-request-create-success", {
        ...logContext,
        pullRequestUrl,
      });
    }

    githubPublishLog("audit-log-write-start", logContext);
    const [event] = await db
      .insert(githubPublishEvents)
      .values({
        workspaceId: parsed.workspaceId,
        userId: parsed.userId,
        connectionId: connection.id,
        repositoryId: repo.id,
        codeWorkspaceId: workspace.metadata.id,
        conversationId: parsed.conversationId,
        agentId: parsed.agentId,
        mode: parsed.mode,
        targetBranch,
        sourceBranch,
        commitSha: commit.sha,
        pullRequestUrl,
        status: "success",
        metadataJson: {
          targetDirectory,
          files: workspace.files.map((file) => repositoryPath(file.path)),
        },
      })
      .returning({ id: githubPublishEvents.id });
    eventId = event.id;
    githubPublishLog("success", {
      ...logContext,
      commitSha: commit.sha,
      pullRequestUrl,
      eventId,
    });

    return {
      kind: "github_publish_result",
      mode: parsed.mode,
      repository: repo.fullName,
      targetBranch,
      sourceBranch: parsed.mode === "pull_request" ? sourceBranch : null,
      commitSha: commit.sha,
      pullRequestUrl,
      files: workspace.files.map((file) => ({
        path: repositoryPath(file.path),
        size: file.size,
      })),
      message: parsed.mode === "pull_request" ? `Pull request created for ${repo.fullName}.` : `Changes pushed to ${repo.fullName}:${targetBranch}.`,
    };
  } catch (error) {
    githubPublishLog(
      "failure",
      {
        ...logContext,
        error: error instanceof Error ? error.message : String(error),
      },
      "error",
    );
    if (!eventId) {
      githubPublishLog("audit-log-failure-write-start", logContext);
      await db.insert(githubPublishEvents).values({
        workspaceId: parsed.workspaceId,
        userId: parsed.userId,
        connectionId: connection.id,
        repositoryId: repo.id,
        codeWorkspaceId: parsed.projectId,
        conversationId: parsed.conversationId,
        agentId: parsed.agentId,
        mode: parsed.mode,
        targetBranch,
        sourceBranch,
        status: "failed",
        metadataJson: {
          error: error instanceof Error ? error.message : String(error),
          targetDirectory,
        },
      });
      githubPublishLog("audit-log-failure-write-success", logContext);
    }
    throw error;
  }
}
