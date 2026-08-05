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
import {
  CodeSandboxExecutionContext,
  CodeSandboxRequest,
  CodeSandboxResult,
  PreparedSandboxRunnerInput,
  clampTimeoutMs,
} from "./code-sandbox.code-sandbox-output-file";
import { prepareSandboxRunnerRequest } from "./code-sandbox.prepare-sandbox-runner-request";
import { failedSandboxResult } from "./code-sandbox.failed-sandbox-result";
import { persistSandboxFiles, runSandboxRunner } from "./code-sandbox.persist-sandbox-files";

export async function executeCodeSandbox(
  input: CodeSandboxRequest,
  context?: CodeSandboxExecutionContext,
): Promise<CodeSandboxResult> {
  const executionId = crypto.randomUUID();
  const startedAt = Date.now();
  let runnerInput: PreparedSandboxRunnerInput;
  try {
    runnerInput = await prepareSandboxRunnerRequest(input, context);
  } catch (error) {
    logHandledWarning("Code sandbox input preparation failed", {
      executionId,
      language: input.language,
      workspaceId: context?.workspaceId,
      userId: context?.userId,
      fileCount: input.files?.length ?? 0,
      attachmentCount: input.attachments?.length ?? 0,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    return failedSandboxResult(
      input,
      error instanceof Error
        ? error.message
        : "Failed to prepare sandbox inputs.",
    );
  }

  logger.info("Code sandbox execution started", {
    executionId,
    language: runnerInput.language,
    workspaceId: context?.workspaceId,
    userId: context?.userId,
    fileCount: runnerInput.files.length,
    timeoutMs: clampTimeoutMs(runnerInput.timeoutMs),
  });
  const result = await runSandboxRunner(runnerInput, executionId);
  const persisted = await persistSandboxFiles(result, context);
  logger.info("Code sandbox execution completed", {
    executionId,
    language: persisted.language,
    workspaceId: context?.workspaceId,
    userId: context?.userId,
    ok: persisted.ok,
    exitCode: persisted.exitCode,
    signal: persisted.signal,
    timedOut: persisted.timedOut,
    durationMs: persisted.durationMs,
    wallDurationMs: Date.now() - startedAt,
    stdoutBytes: Buffer.byteLength(persisted.stdout),
    stderrBytes: Buffer.byteLength(persisted.stderr),
    fileCount: persisted.files.length,
    persistedFileCount: persisted.files.filter((file) => file.attachment)
      .length,
    truncated: persisted.truncated,
  });
  return persisted;
}
