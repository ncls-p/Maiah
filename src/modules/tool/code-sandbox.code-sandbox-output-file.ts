import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";

import { env } from "@/lib/env";
import { logger, logHandledWarning } from "@/lib/logger";
import { isPathTraversal } from "@/lib/path-utils";
import {
  createChatAttachment,
  getChatAttachmentBytes,
  getChatAttachmentExtractedText,
  isChatFileAttachment,
  type ChatAttachment,
} from "@/modules/chat/attachments";

type CodeSandboxLanguage = "python" | "node" | "bash";

type CodeSandboxInputFile = {
  path: string;
  content?: string;
  contentBase64?: string;
};

type CodeSandboxAttachmentReference = {
  id: string;
  path?: string;
  includeExtractedText?: boolean;
};

export type CodeSandboxOutputFile = {
  path: string;
  size: number;
  mimeType: string;
  hash?: string;
  textPreview?: string;
  truncated?: boolean;
  fromInput?: boolean;
  modified?: boolean;
  skipped?: "too_large";
  contentBase64?: string;
  contentOmitted?: "too_large" | "total_limit";
  attachment?: ChatAttachment;
  downloadUrl?: string;
  downloadError?: string;
};

export type CodeSandboxResult = {
  kind: "code_sandbox_result";
  ok: boolean;
  language: CodeSandboxLanguage;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
  files: CodeSandboxOutputFile[];
  error?: string;
};

export type CodeSandboxRequest = {
  language: CodeSandboxLanguage;
  code: string;
  stdin?: string;
  files?: CodeSandboxInputFile[];
  attachments?: CodeSandboxAttachmentReference[];
  timeoutMs?: number;
};

export type CodeSandboxExecutionContext = {
  workspaceId: string;
  userId: string;
};

export type PreparedSandboxRunnerInput = Omit<
  CodeSandboxRequest,
  "files" | "stdin"
> & {
  language: CodeSandboxLanguage;
  stdin?: string;
  stdinFile?: Buffer;
  files: Array<{ path: string; bytes: Buffer }>;
};

type NormalizeSandboxResponseOptions = {
  responseTruncated: boolean;
};

const requestTimeoutBufferMs = 30_000;
export const maxResponseBytes = 8_000_000;
export const defaultSocketPath = "/run/sandbox/sandbox.sock";
export const localDevSocketPath = path.resolve(
  /*turbopackIgnore: true*/ process.cwd(),
  ".data/sandbox-runner/sandbox.sock",
);
export const maxSandboxInputFiles = 40;
export const maxSandboxInputFileBytes = 1_500_000;
export const maxSandboxInputTotalBytes = 5_000_000;
export const maxSandboxInlineStdinChars = 100_000;
export const maxSandboxCodeChars = 100_000;
const defaultSandboxTimeoutMs = 15_000;
const maxSandboxTimeoutMs = 120_000;

export function normalizeLanguage(input: CodeSandboxRequest) {
  if (
    input.language === "python" ||
    input.language === "node" ||
    input.language === "bash"
  ) {
    return input.language;
  }
  throw new Error("language must be 'python', 'node', or 'bash'.");
}

function languageFromPayload(
  payload: Partial<CodeSandboxResult>,
  input: PreparedSandboxRunnerInput,
) {
  if (
    payload.language === "python" ||
    payload.language === "node" ||
    payload.language === "bash"
  ) {
    return payload.language;
  }
  return input.language;
}

export function clampTimeoutMs(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultSandboxTimeoutMs;
  }
  return Math.max(250, Math.min(maxSandboxTimeoutMs, Math.floor(value)));
}

export function requestTimeoutMs(input: PreparedSandboxRunnerInput) {
  return clampTimeoutMs(input.timeoutMs) + requestTimeoutBufferMs;
}

function normalizeDuration(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeStderr(payload: Partial<CodeSandboxResult>) {
  if (typeof payload.stderr === "string" && payload.stderr.length > 0) {
    return payload.stderr;
  }
  if (payload.ok === false) {
    return typeof payload.error === "string" && payload.error.length > 0
      ? payload.error
      : "Sandbox runner returned an incomplete response.";
  }
  return "";
}

export function normalizeSandboxResponse(
  payload: Partial<CodeSandboxResult>,
  input: PreparedSandboxRunnerInput,
  options: NormalizeSandboxResponseOptions,
): CodeSandboxResult {
  return {
    kind: "code_sandbox_result",
    ok: payload.ok === true,
    language: languageFromPayload(payload, input),
    exitCode: typeof payload.exitCode === "number" ? payload.exitCode : null,
    signal: typeof payload.signal === "string" ? payload.signal : null,
    timedOut: payload.timedOut === true,
    durationMs: normalizeDuration(payload.durationMs),
    stdout: typeof payload.stdout === "string" ? payload.stdout : "",
    stderr: normalizeStderr(payload),
    truncated: Boolean(payload.truncated || options.responseTruncated),
    files: Array.isArray(payload.files) ? payload.files : [],
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
}
