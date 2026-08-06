import { existsSync } from "node:fs";
import path from "node:path";

import { env } from "@/lib/env";
import { isPathTraversal } from "@/lib/path-utils";
import { type ChatAttachment } from "@/modules/chat/attachments";
import { CodeSandboxRequest,CodeSandboxResult,defaultSocketPath,localDevSocketPath,maxSandboxInputFileBytes,maxSandboxInputFiles,maxSandboxInputTotalBytes } from "./code-sandbox.code-sandbox-output-file";

export function failedSandboxResult(input: CodeSandboxRequest, message: string): CodeSandboxResult {
  return {
    kind: "code_sandbox_result",
    ok: false,
    language: input.language === "python" || input.language === "node" || input.language === "bash" ? input.language : "python",
    exitCode: null,
    signal: null,
    timedOut: false,
    durationMs: 0,
    stdout: "",
    stderr: message,
    truncated: false,
    files: [],
    error: message,
  };
}

function absoluteSocketPath(socketPath: string) {
  return path.isAbsolute(socketPath) ? socketPath : path.resolve(/*turbopackIgnore: true*/ process.cwd(), socketPath);
}

export function resolveSandboxRunnerSocket() {
  if (process.env.SANDBOX_RUNNER_SOCKET) {
    return absoluteSocketPath(env.SANDBOX_RUNNER_SOCKET);
  }
  if (env.SANDBOX_RUNNER_SOCKET === defaultSocketPath && existsSync(localDevSocketPath)) {
    return localDevSocketPath;
  }
  return absoluteSocketPath(env.SANDBOX_RUNNER_SOCKET);
}

export function sandboxUnavailableMessage(error: unknown, socketPath: string) {
  const message = error instanceof Error ? error.message : String(error);
  const localHint = socketPath === defaultSocketPath && !existsSync(defaultSocketPath) ? " For local development, start the runner with `docker compose -f docker-compose.dev.yml up -d sandbox-runner` and set SANDBOX_RUNNER_SOCKET=.data/sandbox-runner/sandbox.sock." : "";
  return `Sandbox runner unavailable at ${socketPath}: ${message}${localHint}`;
}

export function safeRelativePath(rawPath: string) {
  if (typeof rawPath !== "string") {
    throw new Error("File path must be a string.");
  }
  const trimmed = rawPath.trim().replace(/\\/g, "/");
  if (!trimmed || trimmed.includes("\0")) throw new Error("Invalid file path.");
  if (trimmed.startsWith("/") || /^[a-zA-Z]:\//.test(trimmed)) {
    throw new Error("Absolute file paths are not allowed.");
  }
  const normalized = path.posix.normalize(trimmed).replace(/^\.\//, "");
  if (isPathTraversal(normalized)) {
    throw new Error("Path traversal is not allowed.");
  }
  if (normalized.length > 260 || normalized.split("/").length > 16) {
    throw new Error("File path is too long or too deep.");
  }
  const [firstSegment] = normalized.split("/");
  const reservedSandboxFile = ["main.py", "main.mjs", "main.sh", "package.json", ".stdin", ".stdout"].includes(normalized);
  const reservedSandboxDirectory = ["node_modules", "home", "tmp"].includes(firstSegment ?? "");
  if (reservedSandboxFile || reservedSandboxDirectory) {
    throw new Error("Reserved sandbox file path.");
  }
  return normalized;
}

function bytesFromBase64(value: string, filePath: string) {
  const normalized = value.replace(/\s/g, "");
  if (normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error(`Input file is not valid base64: ${filePath}`);
  }
  return Buffer.from(normalized, "base64");
}

export function normalizeInputFiles(input: CodeSandboxRequest) {
  const files = Array.isArray(input.files) ? input.files : [];
  if (files.length > maxSandboxInputFiles) {
    throw new Error(`Too many input files. Maximum is ${maxSandboxInputFiles}.`);
  }

  let totalInputBytes = 0;
  return files.map((file) => {
    const filePath = safeRelativePath(file.path);
    const hasBase64 = typeof file.contentBase64 === "string";
    const textContent = typeof file.content === "string" ? file.content : "";
    const bytes = hasBase64 ? bytesFromBase64(file.contentBase64 ?? "", filePath) : Buffer.from(textContent, "utf8");
    if (bytes.byteLength > maxSandboxInputFileBytes) {
      throw new Error(`Input file is too large: ${filePath}`);
    }
    totalInputBytes += bytes.byteLength;
    if (totalInputBytes > maxSandboxInputTotalBytes) {
      throw new Error(`Input files are too large. Maximum total is ${maxSandboxInputTotalBytes} bytes.`);
    }
    return { path: filePath, bytes };
  });
}

function sanitizeAttachmentFileName(fileName: string) {
  const baseName = path.basename(fileName.replace(/\\/g, "/")).trim();
  const safeName = baseName
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .slice(0, 120)
    .trim();
  return safeName || "attachment.bin";
}

export function defaultAttachmentPath(attachment: ChatAttachment) {
  return `attachments/${sanitizeAttachmentFileName(attachment.fileName)}`;
}

export function documentExplorerRootPath(filePath: string) {
  const parsed = path.posix.parse(filePath.replace(/\\/g, "/"));
  const baseName = `${parsed.name || "attachment"}.document`;
  return path.posix.join(parsed.dir, baseName).slice(0, 220);
}

export type DocumentExplorerUnit = {
  title: string;
  text: string;
  page?: number;
};

export type DocumentExplorerFile = {
  path: string;
  bytes: Buffer;
};

export const documentExplorerMetadataReserveBytes = 24_000;
export const maxDocumentExplorerChunkChars = 350_000;
export const minDocumentExplorerChunkChars = 40_000;
