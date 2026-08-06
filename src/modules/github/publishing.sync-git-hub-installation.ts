import { and,desc,eq,sql } from "drizzle-orm";

import { normalizeWorkspacePath } from "@/modules/code-workspace/storage";
import { db } from "@/server/infrastructure/db";
import { userGithubConnections,userGithubRepositories } from "@/server/infrastructure/db/schema";
import { createGitHubInstallationSettingsUrl,describeGitHubRepositoryAccess,describeGitHubRepositoryRelationship,fetchInstallationRepositories,normalizePermissions,normalizeRepositorySelection } from "./publishing.create-git-hub-state";
import { GitHubConnectionSummary,GitHubRepositorySummary,getInstallationToken,githubAppConfigured,githubRequest,signGitHubAppJwt } from "./publishing.git-hub-repository-summary";

export async function syncGitHubInstallation(input: { userId: string; installationId: string }) {
  const appJwt = signGitHubAppJwt();
  const installation = await githubRequest<{
    id: number;
    account?: { id?: number; login?: string; type?: string } | null;
    html_url?: string | null;
    repository_selection?: string | null;
  }>(`/app/installations/${encodeURIComponent(input.installationId)}`, appJwt);
  const accountLogin = installation.account?.login ?? "GitHub";
  const accountId = installation.account?.id?.toString() ?? null;
  const accountType = installation.account?.type ?? null;
  const repositorySelection = normalizeRepositorySelection(installation.repository_selection);
  const settingsUrl = createGitHubInstallationSettingsUrl({
    installationId: String(installation.id),
    accountLogin,
    accountType,
    htmlUrl: installation.html_url,
  });
  const syncedAt = new Date();

  const [connection] = await db
    .insert(userGithubConnections)
    .values({
      userId: input.userId,
      installationId: String(installation.id),
      accountLogin,
      accountId,
      accountType,
      repositorySelection,
      settingsUrl,
      lastSyncedAt: syncedAt,
      updatedAt: syncedAt,
    })
    .onConflictDoUpdate({
      target: [userGithubConnections.userId, userGithubConnections.installationId],
      set: {
        accountLogin,
        accountId,
        accountType,
        repositorySelection,
        settingsUrl,
        lastSyncedAt: syncedAt,
        updatedAt: syncedAt,
      },
    })
    .returning();

  const installationToken = await getInstallationToken(String(installation.id));
  const repositories = await fetchInstallationRepositories(installationToken);

  await db.delete(userGithubRepositories).where(eq(userGithubRepositories.connectionId, connection.id));
  if (repositories.length > 0) {
    await db
      .insert(userGithubRepositories)
      .values(
        repositories.map((repo) => ({
          connectionId: connection.id,
          userId: input.userId,
          githubRepositoryId: String(repo.id),
          owner: repo.owner.login,
          name: repo.name,
          fullName: repo.full_name,
          private: repo.private,
          defaultBranch: repo.default_branch,
          permissionsJson: normalizePermissions(repo.permissions),
          lastSyncedAt: syncedAt,
        })),
      )
      .onConflictDoUpdate({
        target: [userGithubRepositories.userId, userGithubRepositories.owner, userGithubRepositories.name],
        set: {
          connectionId: sql`excluded.connection_id`,
          githubRepositoryId: sql`excluded.github_repository_id`,
          fullName: sql`excluded.full_name`,
          private: sql`excluded.private`,
          defaultBranch: sql`excluded.default_branch`,
          permissionsJson: sql`excluded.permissions_json`,
          lastSyncedAt: sql`excluded.last_synced_at`,
        },
      });
  }

  return getUserGitHubStatus({ userId: input.userId });
}

export async function syncUserGitHubInstallations(input: { userId: string; connectionId?: string }) {
  const query = input.connectionId ? and(eq(userGithubConnections.userId, input.userId), eq(userGithubConnections.id, input.connectionId)) : eq(userGithubConnections.userId, input.userId);
  const connections = await db.select().from(userGithubConnections).where(query);

  for (const connection of connections) {
    await syncGitHubInstallation({
      userId: input.userId,
      installationId: connection.installationId,
    });
  }

  return getUserGitHubStatus({ userId: input.userId });
}

export async function getUserGitHubStatus(input: { userId: string; origin?: string; workspaceId?: string }) {
  const connections = await db.select().from(userGithubConnections).where(eq(userGithubConnections.userId, input.userId)).orderBy(desc(userGithubConnections.updatedAt));
  const repositories = await db.select().from(userGithubRepositories).where(eq(userGithubRepositories.userId, input.userId));
  const connectPath = githubAppConfigured() && input.workspaceId ? `/api/workspace/github/connect?workspaceId=${encodeURIComponent(input.workspaceId)}` : null;
  const connectionsById = new Map(connections.map((connection) => [connection.id, connection]));
  return {
    configured: githubAppConfigured(),
    connectPath,
    connectUrl: connectPath && input.origin ? new URL(connectPath, input.origin).toString() : connectPath,
    connections: connections.map(
      (connection): GitHubConnectionSummary => ({
        id: connection.id,
        installationId: connection.installationId,
        accountLogin: connection.accountLogin,
        accountType: connection.accountType,
        repositorySelection: connection.repositorySelection,
        settingsUrl: connection.settingsUrl,
        lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
      }),
    ),
    repositories: repositories
      .map((repo): GitHubRepositorySummary => {
        const permissions = normalizePermissions(repo.permissionsJson);
        const connection = connectionsById.get(repo.connectionId);
        return {
          id: repo.id,
          connectionId: repo.connectionId,
          owner: repo.owner,
          name: repo.name,
          fullName: repo.fullName,
          private: repo.private,
          defaultBranch: repo.defaultBranch,
          permissions,
          access: describeGitHubRepositoryAccess(permissions),
          relationship: describeGitHubRepositoryRelationship({
            accountLogin: connection?.accountLogin ?? null,
            owner: repo.owner,
          }),
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName)),
  };
}

export async function getUserRepository(input: { userId: string; repositoryId: string }) {
  const [repo] = await db
    .select()
    .from(userGithubRepositories)
    .where(and(eq(userGithubRepositories.userId, input.userId), eq(userGithubRepositories.id, input.repositoryId)))
    .limit(1);
  if (!repo) throw new Error("GitHub repository not found for this user.");
  const [connection] = await db
    .select()
    .from(userGithubConnections)
    .where(and(eq(userGithubConnections.userId, input.userId), eq(userGithubConnections.id, repo.connectionId)))
    .limit(1);
  if (!connection) throw new Error("GitHub connection not found.");
  return { repo, connection };
}

export function assertSafeBranchName(branch: string) {
  if (branch.startsWith("/") || branch.endsWith("/") || branch.includes("..") || branch.includes("@{") || /[\\\s~^:?*[]/.test(branch)) {
    throw new Error("Invalid Git branch name.");
  }
  return branch;
}

export function encodeRefPath(branch: string) {
  return assertSafeBranchName(branch).split("/").map(encodeURIComponent).join("/");
}

export function normalizeTargetDirectory(value: string | undefined) {
  if (!value?.trim()) return "";
  const normalized = normalizeWorkspacePath(value);
  return normalized.replace(/\/+$/g, "");
}

export function prefixedPath(directory: string, filePath: string) {
  return directory ? `${directory}/${filePath}` : filePath;
}
