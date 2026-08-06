import { createPrivateKey,createSign } from "node:crypto";
import { z } from "zod";

import { env } from "@/lib/env";

type GitHubPublishMode = "pull_request" | "direct_push";

export type GitHubRepositorySummary = {
  id: string;
  connectionId: string;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  permissions: Record<string, unknown> | null;
  access: "admin" | "maintain" | "write" | "triage" | "read" | "unknown";
  relationship: "account" | "collaborator";
};

export type GitHubConnectionSummary = {
  id: string;
  installationId: string;
  accountLogin: string;
  accountType: string | null;
  repositorySelection: string | null;
  settingsUrl: string | null;
  lastSyncedAt: string | null;
};

export type GitHubPublishResult = {
  kind: "github_publish_result";
  mode: GitHubPublishMode;
  repository: string;
  targetBranch: string;
  sourceBranch: string | null;
  commitSha: string;
  pullRequestUrl: string | null;
  files: Array<{ path: string; size: number }>;
  message: string;
};

const githubApiBaseUrl = "https://api.github.com";
export const githubStateMaxAgeMs = 10 * 60 * 1000;
export const githubRepositorySyncPageSize = 100;
export const githubRepositorySyncMaxPages = 30;
export const maxCommitFiles = 500;
export const maxCommitBytes = 50 * 1024 * 1024;
export const blockedPublishPathPatterns = [/(^|\/)\.env(?:\.|$)/i, /(^|\/)\.github\/workflows\//i, /(^|\/)id_rsa$/i, /\.(?:pem|key|p12|pfx)$/i];
export const secretPatterns = [/GH[PSU]_[A-Za-z0-9_]{20,}/, /github_pat_[A-Za-z0-9_]{20,}/, /sk-[A-Za-z0-9]{20,}/, /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, /(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"']{16,}["']/i];

export function githubPublishLog(stage: string, metadata: Record<string, unknown>, level: "info" | "error" = "info") {
  console[level]("[github-publish]", { stage, ...metadata });
}

export const publishInputSchema = z.object({
  workspaceId: z.uuid(),
  userId: z.uuid(),
  projectId: z.uuid(),
  repositoryId: z.uuid(),
  mode: z.enum(["pull_request", "direct_push"]),
  targetBranch: z.string().trim().min(1).max(255),
  sourceBranch: z.string().trim().min(1).max(255).optional(),
  targetDirectory: z.string().trim().max(260).optional(),
  commitMessage: z.string().trim().min(1).max(240),
  pullRequestTitle: z.string().trim().min(1).max(240).optional(),
  pullRequestBody: z.string().trim().max(4000).optional(),
  conversationId: z.uuid().optional(),
  agentId: z.uuid().optional(),
  confirmDirectPush: z.boolean().default(false),
});

export type PublishCodeWorkspaceInput = z.input<typeof publishInputSchema>;

export function githubAppConfigured() {
  return Boolean(env.GITHUB_APP_ID && env.GITHUB_APP_SLUG && env.GITHUB_APP_PRIVATE_KEY);
}

export function normalizeGitHubPrivateKey(rawValue: string) {
  let privateKey = rawValue.trim();
  privateKey = privateKey.replace(/^export\s+GITHUB_APP_PRIVATE_KEY\s*=\s*/i, "");
  privateKey = privateKey.replace(/^GITHUB_APP_PRIVATE_KEY\s*=\s*/i, "");
  privateKey = privateKey.replace(/%$/, "").trim();
  const firstChar = privateKey[0];
  const lastChar = privateKey[privateKey.length - 1];
  const isQuoted = firstChar === lastChar && ['"', "'", "`"].includes(firstChar);
  if (isQuoted) {
    privateKey = privateKey.slice(1, -1).trim();
  }
  privateKey = privateKey
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  if (!privateKey.includes("-----BEGIN")) {
    const compact = privateKey.replace(/\s+/g, "");
    if (/^[A-Za-z0-9+/=]+$/.test(compact)) {
      const decoded = Buffer.from(compact, "base64").toString("utf8").trim();
      if (decoded.includes("-----BEGIN")) privateKey = decoded;
    }
  }

  const pemMatch = privateKey.match(/-----BEGIN ([^-]+)-----\s*([A-Za-z0-9+/=\s]+)\s*-----END \1-----/);
  if (pemMatch) {
    const label = pemMatch[1];
    const body = pemMatch[2].replace(/\s+/g, "");
    const wrappedBody = body.match(/.{1,64}/g)?.join("\n") ?? body;
    privateKey = `-----BEGIN ${label}-----\n${wrappedBody}\n-----END ${label}-----\n`;
  }

  return privateKey;
}

export function requireGitHubAppConfig() {
  if (!githubAppConfigured()) {
    throw new Error("GitHub publishing is not configured. Set GITHUB_APP_ID, GITHUB_APP_SLUG, and GITHUB_APP_PRIVATE_KEY.");
  }
  try {
    return {
      appId: env.GITHUB_APP_ID!,
      appSlug: env.GITHUB_APP_SLUG!,
      privateKey: createPrivateKey(normalizeGitHubPrivateKey(env.GITHUB_APP_PRIVATE_KEY!)),
    };
  } catch {
    throw new Error("Invalid GITHUB_APP_PRIVATE_KEY. Paste the full GitHub App PEM private key, using escaped \\n newlines in env managers and no literal wrapping quotes.");
  }
}

export function base64Url(value: Buffer | string) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function signGitHubAppJwt() {
  const { appId, privateKey } = requireGitHubAppConfig();
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }));
  const unsigned = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(privateKey);
  return `${unsigned}.${base64Url(signature)}`;
}

export async function githubRequest<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${githubApiBaseUrl}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const text = await response.text();
  const body = text
    ? (() => {
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return null;
        }
      })()
    : null;
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "message" in body && typeof (body as { message?: unknown }).message === "string" ? (body as { message: string }).message : response.statusText;
    githubPublishLog(
      "github-api-error",
      {
        method: options.method ?? "GET",
        path,
        status: response.status,
        message,
      },
      "error",
    );
    throw new Error(`GitHub API error (${response.status}): ${message}`);
  }
  return body as T;
}

export async function getInstallationToken(installationId: string) {
  const appJwt = signGitHubAppJwt();
  const result = await githubRequest<{ token: string; expires_at: string }>(`/app/installations/${encodeURIComponent(installationId)}/access_tokens`, appJwt, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return result.token;
}
