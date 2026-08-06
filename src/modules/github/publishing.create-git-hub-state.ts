import { createHmac,randomUUID } from "node:crypto";

import { env } from "@/lib/env";
import { GitHubRepositorySummary,base64Url,githubRepositorySyncMaxPages,githubRepositorySyncPageSize,githubRequest,githubStateMaxAgeMs,requireGitHubAppConfig } from "./publishing.git-hub-repository-summary";

function stateSecret() {
  return env.APP_ENCRYPTION_KEY;
}

export function createGitHubState(input: { userId: string; workspaceId: string }) {
  const payload = base64Url(
    JSON.stringify({
      userId: input.userId,
      workspaceId: input.workspaceId,
      expiresAt: Date.now() + githubStateMaxAgeMs,
      nonce: randomUUID(),
    }),
  );
  const signature = base64Url(createHmac("sha256", stateSecret()).update(payload).digest());
  return `${payload}.${signature}`;
}

export function parseGitHubState(state: string) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) throw new Error("Invalid GitHub state.");
  const expected = base64Url(createHmac("sha256", stateSecret()).update(payload).digest());
  if (signature !== expected) throw new Error("Invalid GitHub state signature.");
  let parsed: { userId?: unknown; workspaceId?: unknown; expiresAt?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    throw new Error("Failed to parse GitHub state payload.");
  }
  if (typeof parsed.userId !== "string" || typeof parsed.workspaceId !== "string" || typeof parsed.expiresAt !== "number" || parsed.expiresAt < Date.now()) {
    throw new Error("GitHub state expired or invalid.");
  }
  return {
    userId: parsed.userId,
    workspaceId: parsed.workspaceId,
  };
}

export function createGitHubConnectUrl(input: { origin: string; workspaceId: string; userId: string }) {
  const { appSlug } = requireGitHubAppConfig();
  const state = createGitHubState({
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  let url: URL;
  try {
    url = new URL(`https://github.com/apps/${appSlug}/installations/new`);
  } catch {
    throw new Error("Failed to construct GitHub connect URL");
  }
  url.searchParams.set("state", state);
  return url.toString();
}

export function normalizePermissions(value: unknown) {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

export function normalizeRepositorySelection(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function permissionEnabled(permissions: Record<string, unknown> | null, key: string) {
  return permissions?.[key] === true;
}

export function describeGitHubRepositoryAccess(permissions: Record<string, unknown> | null): GitHubRepositorySummary["access"] {
  if (!permissions) return "unknown";
  if (permissionEnabled(permissions, "admin")) return "admin";
  if (permissionEnabled(permissions, "maintain")) return "maintain";
  if (permissionEnabled(permissions, "push")) return "write";
  if (permissionEnabled(permissions, "triage")) return "triage";
  if (permissionEnabled(permissions, "pull")) return "read";
  return "unknown";
}

export function describeGitHubRepositoryRelationship(input: { accountLogin: string | null; owner: string }): GitHubRepositorySummary["relationship"] {
  return input.accountLogin?.toLowerCase() === input.owner.toLowerCase() ? "account" : "collaborator";
}

export function canAttemptGitHubRepositoryPublish(permissions: Record<string, unknown> | null) {
  const access = describeGitHubRepositoryAccess(permissions);
  return access === "unknown" || access === "admin" || access === "maintain" || access === "write";
}

function trustedGitHubUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "github.com" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function createGitHubInstallationSettingsUrl(input: { installationId: string; accountLogin?: string | null; accountType?: string | null; htmlUrl?: string | null }) {
  const htmlUrl = trustedGitHubUrl(input.htmlUrl);
  if (htmlUrl) return htmlUrl;
  const encodedInstallationId = encodeURIComponent(input.installationId);
  if (input.accountType === "Organization" && input.accountLogin) {
    return `https://github.com/organizations/${encodeURIComponent(input.accountLogin)}/settings/installations/${encodedInstallationId}`;
  }
  return `https://github.com/settings/installations/${encodedInstallationId}`;
}

type GitHubInstallationRepository = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  owner: { login: string };
  permissions?: unknown;
};

export async function fetchInstallationRepositories(token: string) {
  const repositories: GitHubInstallationRepository[] = [];
  for (let page = 1; page <= githubRepositorySyncMaxPages; page += 1) {
    const result = await githubRequest<{
      repositories: GitHubInstallationRepository[];
    }>(`/installation/repositories?per_page=${githubRepositorySyncPageSize}&page=${page}`, token);
    repositories.push(...result.repositories);
    if (result.repositories.length < githubRepositorySyncPageSize) break;
  }
  return repositories;
}
