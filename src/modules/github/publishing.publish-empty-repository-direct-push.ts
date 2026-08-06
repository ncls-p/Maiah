import { createRepositoryFile } from "./publishing.common-workspace-directory";
import { githubPublishLog } from "./publishing.git-hub-repository-summary";

export async function publishEmptyRepositoryDirectPush(input: { token: string; owner: string; repo: string; branch: string; files: Array<{ path: string; bytes: Uint8Array; size: number }>; commitMessage: string; logContext: Record<string, unknown> }) {
  let commitSha = "";
  const publishedFiles: Array<{ path: string; size: number }> = [];
  for (const [index, file] of input.files.entries()) {
    githubPublishLog("empty-repository-file-create-start", {
      ...input.logContext,
      path: file.path,
      index: index + 1,
      total: input.files.length,
    });
    const created = await createRepositoryFile({
      token: input.token,
      owner: input.owner,
      repo: input.repo,
      branch: input.branch,
      path: file.path,
      bytes: file.bytes,
      message: input.commitMessage,
    });
    commitSha = created.commit.sha;
    publishedFiles.push({ path: file.path, size: file.size });
    githubPublishLog("empty-repository-file-create-success", {
      ...input.logContext,
      path: file.path,
      index: index + 1,
      total: input.files.length,
      commitSha,
    });
  }
  return { commitSha, files: publishedFiles };
}
