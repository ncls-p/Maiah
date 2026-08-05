import { isTextWorkspacePath } from "@/modules/code-workspace/storage";
import { blockedPublishPathPatterns,getInstallationToken,githubPublishLog,githubRequest,secretPatterns } from "./publishing.git-hub-repository-summary";
import { assertSafeBranchName,encodeRefPath,getUserRepository } from "./publishing.sync-git-hub-installation";

export function commonWorkspaceDirectory(filePaths: string[]) {
  if (filePaths.length === 0) return "";
  const pathSegments = filePaths.map((filePath) => filePath.split("/"));
  const maxDirectorySegments = Math.min(...pathSegments.map((segments) => Math.max(segments.length - 1, 0)));
  const commonSegments: string[] = [];

  for (let index = 0; index < maxDirectorySegments; index += 1) {
    const segment = pathSegments[0]?.[index];
    if (!segment || pathSegments.some((segments) => segments[index] !== segment)) {
      break;
    }
    commonSegments.push(segment);
  }

  return commonSegments.join("/");
}

export function workspaceContentPath(directory: string, filePath: string) {
  return directory ? filePath.slice(directory.length + 1) : filePath;
}

export function assertPublishPathAllowed(filePath: string) {
  if (blockedPublishPathPatterns.some((pattern) => pattern.test(filePath))) {
    throw new Error(`Publishing this path is blocked for safety: ${filePath}`);
  }
}

export function scanTextForSecrets(filePath: string, bytes: Uint8Array) {
  if (!isTextWorkspacePath(filePath)) return;
  const text = Buffer.from(bytes).toString("utf8");
  if (secretPatterns.some((pattern) => pattern.test(text))) {
    throw new Error(`Potential secret detected in ${filePath}. Remove secrets before publishing to GitHub.`);
  }
}

export async function listGitHubBranches(input: { userId: string; repositoryId: string }) {
  const { repo, connection } = await getUserRepository(input);
  const token = await getInstallationToken(connection.installationId);
  const branches = await githubRequest<Array<{ name: string; protected?: boolean; commit?: { sha?: string } }>>(`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/branches?per_page=100`, token);
  return branches.map((branch) => ({
    name: branch.name,
    protected: Boolean(branch.protected),
    sha: branch.commit?.sha ?? null,
  }));
}

export async function getGitRef(input: { token: string; owner: string; repo: string; branch: string }) {
  return githubRequest<{ object: { sha: string; type: string } }>(`/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/git/ref/heads/${encodeRefPath(input.branch)}`, input.token);
}

export async function gitRefExists(input: { token: string; owner: string; repo: string; branch: string }) {
  try {
    await getGitRef(input);
    return true;
  } catch (error) {
    if (error instanceof Error && /GitHub API error \(404\)/.test(error.message)) {
      return false;
    }
    throw error;
  }
}

export function isEmptyGitRepositoryError(error: unknown) {
  return error instanceof Error && /GitHub API error \(409\): Git Repository is empty/i.test(error.message);
}

export async function createGitRef(input: { token: string; owner: string; repo: string; branch: string; sha: string }) {
  return githubRequest(`/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/git/refs`, input.token, {
    method: "POST",
    body: JSON.stringify({
      ref: `refs/heads/${assertSafeBranchName(input.branch)}`,
      sha: input.sha,
    }),
  });
}

function encodeRepositoryContentPath(filePath: string) {
  return filePath.split("/").map(encodeURIComponent).join("/");
}

export async function createRepositoryFile(input: { token: string; owner: string; repo: string; branch: string; path: string; bytes: Uint8Array; message: string }) {
  return githubRequest<{ commit: { sha: string; tree?: { sha?: string } } }>(`/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/contents/${encodeRepositoryContentPath(input.path)}`, input.token, {
    method: "PUT",
    body: JSON.stringify({
      branch: input.branch,
      message: input.message,
      content: Buffer.from(input.bytes).toString("base64"),
    }),
  });
}

export async function getCommitTreeSha(input: { token: string; owner: string; repo: string; commitSha: string }) {
  const commit = await githubRequest<{ tree: { sha: string } }>(`/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/git/commits/${encodeURIComponent(input.commitSha)}`, input.token);
  return commit.tree.sha;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getCommitTreeShaWithRetry(input: { token: string; owner: string; repo: string; commitSha: string; logContext: Record<string, unknown> }) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await getCommitTreeSha(input);
    } catch (error) {
      lastError = error;
      if (!isEmptyGitRepositoryError(error) || attempt === 5) break;
      githubPublishLog("commit-tree-retry", {
        ...input.logContext,
        commitSha: input.commitSha,
        attempt,
      });
      await wait(500 * attempt);
    }
  }
  throw lastError;
}

export async function initializeEmptyRepository(input: { token: string; owner: string; repo: string; branch: string; path: string; bytes: Uint8Array; logContext: Record<string, unknown> }) {
  githubPublishLog("empty-repository-initialize-start", {
    ...input.logContext,
    initialPath: input.path,
  });
  const created = await createRepositoryFile({
    token: input.token,
    owner: input.owner,
    repo: input.repo,
    branch: input.branch,
    path: input.path,
    bytes: input.bytes,
    message: "Initialize repository for Maiah publishing",
  });
  const commitSha = created.commit.sha;
  const treeSha =
    created.commit.tree?.sha ||
    (await getCommitTreeShaWithRetry({
      token: input.token,
      owner: input.owner,
      repo: input.repo,
      commitSha,
      logContext: input.logContext,
    }));
  githubPublishLog("empty-repository-initialize-success", {
    ...input.logContext,
    initialPath: input.path,
    commitSha,
  });
  return { commitSha, treeSha };
}
