import http from "node:http";

import { createChatAttachment } from "@/modules/chat/attachments";
import {
  CodeSandboxExecutionContext,
  CodeSandboxOutputFile,
  CodeSandboxResult,
  maxResponseBytes,
  normalizeSandboxResponse,
  PreparedSandboxRunnerInput,
  requestTimeoutMs,
} from "./code-sandbox.code-sandbox-output-file";
import {
  resolveSandboxRunnerSocket,
  sandboxUnavailableMessage,
} from "./code-sandbox.failed-sandbox-result";
import {
  parseJsonResponse,
  sandboxOutputFileName,
  serializeSandboxRunnerRequest,
  shouldPersistSandboxFile,
  stripEmbeddedContent,
} from "./code-sandbox.prepare-sandbox-runner-request";

async function persistSandboxFile(
  file: CodeSandboxOutputFile,
  context: CodeSandboxExecutionContext,
): Promise<CodeSandboxOutputFile> {
  if (!shouldPersistSandboxFile(file)) return stripEmbeddedContent(file);
  try {
    const bytes = Buffer.from(file.contentBase64 ?? "", "base64");
    const attachment = await createChatAttachment({
      workspaceId: context.workspaceId,
      userId: context.userId,
      fileName: sandboxOutputFileName(file.path),
      mimeType: file.mimeType,
      bytes,
    });
    return {
      ...stripEmbeddedContent(file),
      attachment,
      downloadUrl: attachment.url,
    };
  } catch (error) {
    return {
      ...stripEmbeddedContent(file),
      downloadError:
        error instanceof Error
          ? error.message
          : "Failed to persist sandbox output file.",
    };
  }
}

export async function persistSandboxFiles(
  result: CodeSandboxResult,
  context?: CodeSandboxExecutionContext,
): Promise<CodeSandboxResult> {
  if (!context || result.files.length === 0) {
    return {
      ...result,
      files: result.files.map(stripEmbeddedContent),
    };
  }
  return {
    ...result,
    files: await Promise.all(
      result.files.map((file) => persistSandboxFile(file, context)),
    ),
  };
}

async function runSandboxRequest(
  input: PreparedSandboxRunnerInput,
  executionId: string,
  requestPath: string,
): Promise<CodeSandboxResult> {
  const body = serializeSandboxRunnerRequest(input);
  const socketPath = resolveSandboxRunnerSocket();
  return new Promise((resolve) => {
    const request = http.request(
      {
        socketPath,
        path: requestPath,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "X-Sandbox-Execution-Id": executionId,
        },
        timeout: requestTimeoutMs(input),
      },
      (response) => {
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        let responseTruncated = false;

        response.on("data", (chunk: Buffer) => {
          totalBytes += chunk.byteLength;
          if (totalBytes <= maxResponseBytes) {
            chunks.push(chunk);
            return;
          }
          responseTruncated = true;
          const currentBytes = chunks.reduce(
            (total, item) => total + item.byteLength,
            0,
          );
          const remaining = Math.max(0, maxResponseBytes - currentBytes);
          if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
        });

        response.on("end", () => {
          const payload = parseJsonResponse(
            Buffer.concat(chunks).toString("utf8"),
          );
          if (!payload) {
            resolve({
              kind: "code_sandbox_result",
              ok: false,
              language: input.language,
              exitCode: null,
              signal: null,
              timedOut: false,
              durationMs: 0,
              stdout: "",
              stderr: `Sandbox runner returned an invalid response (HTTP ${response.statusCode ?? "unknown"}).`,
              truncated: responseTruncated,
              files: [],
            });
            return;
          }
          resolve(
            normalizeSandboxResponse(payload, input, { responseTruncated }),
          );
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error("Sandbox runner request timed out."));
    });

    request.on("error", (error) => {
      const unavailableMessage = sandboxUnavailableMessage(error, socketPath);
      resolve({
        kind: "code_sandbox_result",
        ok: false,
        language: input.language,
        exitCode: null,
        signal: null,
        timedOut: false,
        durationMs: 0,
        stdout: "",
        stderr: unavailableMessage,
        truncated: false,
        files: [],
        error: unavailableMessage,
      });
    });

    request.end(body);
  });
}

export function runSandboxRunner(
  input: PreparedSandboxRunnerInput,
  executionId: string,
) {
  return runSandboxRequest(input, executionId, "/run");
}

export async function openSandboxSession(
  input: PreparedSandboxRunnerInput,
  executionId: string,
) {
  const body = serializeSandboxRunnerRequest(input);
  const socketPath = resolveSandboxRunnerSocket();
  return new Promise<string>((resolve, reject) => {
    const request = http.request(
      {
        socketPath,
        path: "/sessions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "X-Sandbox-Execution-Id": executionId,
        },
        timeout: requestTimeoutMs(input),
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const payload = parseJsonResponse(
            Buffer.concat(chunks).toString("utf8"),
          ) as { sessionId?: unknown; error?: unknown } | null;
          if (
            response.statusCode !== 201 ||
            typeof payload?.sessionId !== "string"
          ) {
            reject(
              new Error(
                typeof payload?.error === "string"
                  ? payload.error
                  : "Failed to open sandbox session.",
              ),
            );
            return;
          }
          resolve(payload.sessionId);
        });
      },
    );
    request.on("timeout", () =>
      request.destroy(new Error("Sandbox session request timed out.")),
    );
    request.on("error", reject);
    request.end(body);
  });
}

export function runSandboxSession(
  sessionId: string,
  input: PreparedSandboxRunnerInput,
  executionId: string,
) {
  return runSandboxRequest(
    input,
    executionId,
    `/sessions/${encodeURIComponent(sessionId)}/run`,
  );
}

export async function closeSandboxSession(sessionId: string) {
  const socketPath = resolveSandboxRunnerSocket();
  await new Promise<void>((resolve) => {
    const request = http.request(
      {
        socketPath,
        path: `/sessions/${encodeURIComponent(sessionId)}`,
        method: "DELETE",
        timeout: 5_000,
      },
      () => resolve(),
    );
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve());
    request.end();
  });
}
