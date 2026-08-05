"use client";

import { useTranslations } from "next-intl";
import { type SVGProps } from "react";


export const BUTTON_TYPE = "button";
export const OUTLINE_VARIANT = "outline";

export function GithubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.89-.01-1.75-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.08 0-1.12.39-2.04 1.03-2.76-.1-.26-.45-1.31.1-2.73 0 0 .84-.28 2.75 1.05A9.37 9.37 0 0 1 12 6.93c.85 0 1.71.12 2.51.34 1.9-1.33 2.74-1.05 2.74-1.05.55 1.42.2 2.47.1 2.73.64.72 1.03 1.64 1.03 2.76 0 3.95-2.34 4.81-4.57 5.07.36.32.68.95.68 1.92 0 1.39-.01 2.51-.01 2.85 0 .27.18.59.69.49A10.05 10.05 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

type GitHubRepositoryAccess =
  | "admin"
  | "maintain"
  | "write"
  | "triage"
  | "read"
  | "unknown";

export type GitHubConnectionOption = {
  id: string;
  accountLogin: string;
  accountType: string | null;
  repositorySelection: string | null;
  settingsUrl: string | null;
  lastSyncedAt: string | null;
};

export type GitHubRepositoryOption = {
  id: string;
  connectionId: string;
  owner: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  access: GitHubRepositoryAccess;
  relationship: "account" | "collaborator";
};

export type GitHubBranchOption = {
  name: string;
  protected: boolean;
};

export type GitHubPublishResult = {
  kind: "github_publish_result";
  mode: "pull_request" | "direct_push";
  repository: string;
  targetBranch: string;
  sourceBranch: string | null;
  commitSha: string;
  pullRequestUrl: string | null;
  message: string;
};

export type GitHubStatusPayload = {
  configured?: boolean;
  connectPath?: string | null;
  connectUrl?: string | null;
  connections?: GitHubConnectionOption[];
  repositories?: GitHubRepositoryOption[];
  error?: string;
};

export function canAttemptPublishToRepository(access: GitHubRepositoryAccess) {
  return (
    access === "unknown" ||
    access === "admin" ||
    access === "maintain" ||
    access === "write"
  );
}

export function hasLimitedRepositoryAccess(access: GitHubRepositoryAccess) {
  return access === "read" || access === "triage";
}

export function formatLastSynced(
  value: string | null,
  locale: string,
  t: ReturnType<typeof useTranslations<"chat.github">>,
) {
  if (!value) return t("neverSynced");
  return t("syncedAt", {
    date: new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value)),
  });
}

export async function requestGitHubJson<T>(
  url: string,
  init: RequestInit | undefined,
  fallbackError: string,
) {
  const response = await fetch(url, init);
  const data = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok) throw new Error(data?.error || fallbackError);
  return data as T | null;
}
