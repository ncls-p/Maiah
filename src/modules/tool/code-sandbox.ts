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

type CodeSandboxOutputFile = {
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

type CodeSandboxExecutionContext = {
  workspaceId: string;
  userId: string;
};

type PreparedSandboxRunnerInput = Omit<
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
const maxResponseBytes = 8_000_000;
const defaultSocketPath = "/run/sandbox/sandbox.sock";
const localDevSocketPath = path.resolve(
  /*turbopackIgnore: true*/ process.cwd(),
  ".data/sandbox-runner/sandbox.sock",
);
const maxSandboxInputFiles = 40;
const maxSandboxInputFileBytes = 1_500_000;
const maxSandboxInputTotalBytes = 5_000_000;
const maxSandboxInlineStdinChars = 100_000;
const maxSandboxCodeChars = 100_000;
const defaultSandboxTimeoutMs = 15_000;
const maxSandboxTimeoutMs = 120_000;

function normalizeLanguage(input: CodeSandboxRequest) {
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

function clampTimeoutMs(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultSandboxTimeoutMs;
  }
  return Math.max(250, Math.min(maxSandboxTimeoutMs, Math.floor(value)));
}

function requestTimeoutMs(input: PreparedSandboxRunnerInput) {
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

function normalizeSandboxResponse(
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

function failedSandboxResult(
  input: CodeSandboxRequest,
  message: string,
): CodeSandboxResult {
  return {
    kind: "code_sandbox_result",
    ok: false,
    language:
      input.language === "python" ||
      input.language === "node" ||
      input.language === "bash"
        ? input.language
        : "python",
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
  return path.isAbsolute(socketPath)
    ? socketPath
    : path.resolve(/*turbopackIgnore: true*/ process.cwd(), socketPath);
}

function resolveSandboxRunnerSocket() {
  if (process.env.SANDBOX_RUNNER_SOCKET) {
    return absoluteSocketPath(env.SANDBOX_RUNNER_SOCKET);
  }
  if (
    env.SANDBOX_RUNNER_SOCKET === defaultSocketPath &&
    existsSync(localDevSocketPath)
  ) {
    return localDevSocketPath;
  }
  return absoluteSocketPath(env.SANDBOX_RUNNER_SOCKET);
}

function sandboxUnavailableMessage(error: unknown, socketPath: string) {
  const message = error instanceof Error ? error.message : String(error);
  const localHint =
    socketPath === defaultSocketPath && !existsSync(defaultSocketPath)
      ? " For local development, start the runner with `docker compose -f docker-compose.dev.yml up -d sandbox-runner` and set SANDBOX_RUNNER_SOCKET=.data/sandbox-runner/sandbox.sock."
      : "";
  return `Sandbox runner unavailable at ${socketPath}: ${message}${localHint}`;
}

function safeRelativePath(rawPath: string) {
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
  const reservedSandboxFile = [
    "main.py",
    "main.mjs",
    "main.sh",
    "package.json",
    ".stdin",
    ".stdout",
  ].includes(normalized);
  const reservedSandboxDirectory = ["node_modules", "home", "tmp"].includes(
    firstSegment ?? "",
  );
  if (reservedSandboxFile || reservedSandboxDirectory) {
    throw new Error("Reserved sandbox file path.");
  }
  return normalized;
}

function bytesFromBase64(value: string, filePath: string) {
  const normalized = value.replace(/\s/g, "");
  if (
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)
  ) {
    throw new Error(`Input file is not valid base64: ${filePath}`);
  }
  return Buffer.from(normalized, "base64");
}

function normalizeInputFiles(input: CodeSandboxRequest) {
  const files = Array.isArray(input.files) ? input.files : [];
  if (files.length > maxSandboxInputFiles) {
    throw new Error(
      `Too many input files. Maximum is ${maxSandboxInputFiles}.`,
    );
  }

  let totalInputBytes = 0;
  return files.map((file) => {
    const filePath = safeRelativePath(file.path);
    const hasBase64 = typeof file.contentBase64 === "string";
    const textContent = typeof file.content === "string" ? file.content : "";
    const bytes = hasBase64
      ? bytesFromBase64(file.contentBase64 ?? "", filePath)
      : Buffer.from(textContent, "utf8");
    if (bytes.byteLength > maxSandboxInputFileBytes) {
      throw new Error(`Input file is too large: ${filePath}`);
    }
    totalInputBytes += bytes.byteLength;
    if (totalInputBytes > maxSandboxInputTotalBytes) {
      throw new Error(
        `Input files are too large. Maximum total is ${maxSandboxInputTotalBytes} bytes.`,
      );
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

function defaultAttachmentPath(attachment: ChatAttachment) {
  return `attachments/${sanitizeAttachmentFileName(attachment.fileName)}`;
}

function documentExplorerRootPath(filePath: string) {
  const parsed = path.posix.parse(filePath.replace(/\\/g, "/"));
  const baseName = `${parsed.name || "attachment"}.document`;
  return path.posix.join(parsed.dir, baseName).slice(0, 220);
}

type DocumentExplorerUnit = {
  title: string;
  text: string;
  page?: number;
};

type DocumentExplorerFile = {
  path: string;
  bytes: Buffer;
};

const documentExplorerMetadataReserveBytes = 24_000;
const maxDocumentExplorerChunkChars = 350_000;
const minDocumentExplorerChunkChars = 40_000;

function markdownHeadingUnits(markdown: string): DocumentExplorerUnit[] {
  const headings = Array.from(markdown.matchAll(/^#{1,3}\s+(.+)$/gm));
  if (headings.length === 0) {
    return [{ title: "Document", text: markdown }];
  }

  const units: DocumentExplorerUnit[] = [];
  const preamble = markdown.slice(0, headings[0].index).trim();
  if (preamble) units.push({ title: "Overview", text: preamble });
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const start = heading.index;
    const end = headings[index + 1]?.index ?? markdown.length;
    const title = heading[1].trim();
    const pageMatch = title.match(/^Page\s+(\d+)$/i);
    units.push({
      title,
      text: markdown.slice(start, end).trim(),
      ...(pageMatch ? { page: Number.parseInt(pageMatch[1], 10) } : {}),
    });
  }
  return units;
}

function splitDocumentUnit(
  unit: DocumentExplorerUnit,
  targetChars: number,
): DocumentExplorerUnit[] {
  if (unit.text.length <= targetChars) return [unit];
  const parts: DocumentExplorerUnit[] = [];
  let remaining = unit.text;
  let part = 1;
  while (remaining.length > 0) {
    let end = Math.min(targetChars, remaining.length);
    if (end < remaining.length) {
      const paragraphBoundary = remaining.lastIndexOf("\n\n", end);
      const lineBoundary = remaining.lastIndexOf("\n", end);
      const boundary = Math.max(paragraphBoundary, lineBoundary);
      if (boundary >= Math.floor(targetChars * 0.6)) end = boundary;
    }
    const text = remaining.slice(0, end).trim();
    if (text) {
      parts.push({
        ...unit,
        title: `${unit.title} - part ${part}`,
        text,
      });
      part += 1;
    }
    remaining = remaining.slice(Math.max(end, 1)).trimStart();
  }
  return parts;
}

function groupDocumentUnits(
  markdown: string,
  maxChunks: number,
): { groups: DocumentExplorerUnit[][]; complete: boolean } {
  const independentlyBrowsableUnits = markdownHeadingUnits(markdown).flatMap(
    (unit) => splitDocumentUnit(unit, maxDocumentExplorerChunkChars),
  );
  if (independentlyBrowsableUnits.length <= maxChunks) {
    return {
      groups: independentlyBrowsableUnits.map((unit) => [unit]),
      complete: true,
    };
  }

  const targetChars = Math.min(
    maxDocumentExplorerChunkChars,
    Math.max(
      minDocumentExplorerChunkChars,
      Math.ceil((markdown.length * 1.15) / Math.max(maxChunks, 1)),
    ),
  );
  const units = markdownHeadingUnits(markdown).flatMap((unit) =>
    splitDocumentUnit(unit, targetChars),
  );
  const groups: DocumentExplorerUnit[][] = [];
  let current: DocumentExplorerUnit[] = [];
  let currentChars = 0;
  let complete = true;

  for (const unit of units) {
    if (current.length > 0 && currentChars + unit.text.length > targetChars) {
      groups.push(current);
      current = [];
      currentChars = 0;
      if (groups.length >= maxChunks) {
        complete = false;
        break;
      }
    }
    current.push(unit);
    currentChars += unit.text.length;
  }
  if (current.length > 0 && groups.length < maxChunks) groups.push(current);
  if (groups.flat().length < units.length) complete = false;
  return { groups, complete };
}

function safeDocumentChunkSlug(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 54) || "section"
  );
}

function groupTitle(group: DocumentExplorerUnit[]) {
  const first = group[0];
  const last = group.at(-1) ?? first;
  if (group.length === 1) return first.title;
  if (first.page !== undefined && last.page !== undefined) {
    return `Pages ${first.page}-${last.page}`;
  }
  return `${first.title} to ${last.title}`;
}

function utf8Prefix(value: string, maxBytes: number) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.byteLength <= maxBytes) return value;
  return bytes
    .subarray(0, Math.max(0, maxBytes))
    .toString("utf8")
    .replace(/\uFFFD$/, "");
}

function buildDocumentExplorerFiles(input: {
  filePath: string;
  fileName: string;
  mimeType: string;
  markdown: string;
  maxFiles: number;
  maxBytes: number;
  originalIncluded: boolean;
}): DocumentExplorerFile[] {
  const root = documentExplorerRootPath(input.filePath);
  const maxChunks = Math.max(1, input.maxFiles - 2);
  const grouped = groupDocumentUnits(input.markdown, maxChunks);
  const segmentBudget = Math.max(
    0,
    input.maxBytes - documentExplorerMetadataReserveBytes,
  );
  const chunks: Array<{
    path: string;
    title: string;
    chars: number;
    pages?: { start: number; end: number };
    bytes: Buffer;
  }> = [];
  let usedSegmentBytes = 0;
  let includedChars = 0;
  let allChunksComplete = true;

  for (const [index, group] of grouped.groups.entries()) {
    const title = groupTitle(group);
    const text = group.map((unit) => unit.text).join("\n\n");
    const boundedText = utf8Prefix(text, maxSandboxInputFileBytes);
    if (boundedText.length < text.length) allChunksComplete = false;
    const bytes = Buffer.from(boundedText, "utf8");
    if (usedSegmentBytes + bytes.byteLength > segmentBudget) {
      allChunksComplete = false;
      break;
    }
    const firstPage = group.find((unit) => unit.page !== undefined)?.page;
    const lastPage = group.findLast((unit) => unit.page !== undefined)?.page;
    const folder =
      firstPage !== undefined
        ? group.length === 1
          ? "pages"
          : "volumes"
        : "sections";
    const fileName = `${String(index + 1).padStart(3, "0")}-${safeDocumentChunkSlug(title)}.md`;
    chunks.push({
      path: `${root}/${folder}/${fileName}`,
      title,
      chars: boundedText.length,
      ...(firstPage !== undefined && lastPage !== undefined
        ? { pages: { start: firstPage, end: lastPage } }
        : {}),
      bytes,
    });
    usedSegmentBytes += bytes.byteLength;
    includedChars += boundedText.length;
  }

  const complete =
    grouped.complete &&
    allChunksComplete &&
    chunks.length === grouped.groups.length;
  const manifest = {
    version: 1,
    fileName: input.fileName,
    mimeType: input.mimeType,
    extractedMarkdownChars: input.markdown.length,
    includedMarkdownChars: includedChars,
    complete,
    originalIncluded: input.originalIncluded,
    chunks: chunks.map((chunk) => ({
      path: chunk.path,
      title: chunk.title,
      chars: chunk.chars,
      ...(chunk.pages ? { pages: chunk.pages } : {}),
    })),
  };
  const readme = [
    `# Document explorer: ${input.fileName}`,
    "",
    "This directory is a deterministic, embedding-free index for agentic document exploration.",
    "",
    "## Recommended workflow",
    "",
    "1. Read `manifest.json` to see the available pages, sections, or volumes.",
    "2. Search all chunks with `rg -n -i 'term|synonym' .`.",
    "3. Open only relevant ranges with `sed -n 'START,ENDp' <path>` or a short Python script.",
    "4. Follow adjacent page or section files when more context is needed.",
    "5. Combine discovery, search, and relevant reads in one run whenever practical; the sandbox is wiped after every run.",
    "",
    complete
      ? "The complete stored Markdown extraction is present."
      : "The explorer is partial because sandbox safety limits were reached.",
    input.originalIncluded
      ? `The original file is available at \`${input.filePath}\`.`
      : "The original file was omitted from this sandbox run to prioritize the searchable extraction.",
  ].join("\n");

  return [
    { path: `${root}/README.md`, bytes: Buffer.from(readme, "utf8") },
    {
      path: `${root}/manifest.json`,
      bytes: Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
    },
    ...chunks.map(({ path: chunkPath, bytes }) => ({
      path: chunkPath,
      bytes,
    })),
  ];
}

function uniqueSandboxPath(filePath: string, usedPaths: Set<string>) {
  const normalized = safeRelativePath(filePath);
  if (!usedPaths.has(normalized)) {
    usedPaths.add(normalized);
    return normalized;
  }
  const parsed = path.posix.parse(normalized);
  for (let index = 2; index < 100; index += 1) {
    const candidate = path.posix.join(
      parsed.dir,
      `${parsed.name}-${index}${parsed.ext}`,
    );
    if (!usedPaths.has(candidate)) {
      usedPaths.add(candidate);
      return candidate;
    }
  }
  throw new Error(`Too many sandbox files named ${normalized}.`);
}

async function prepareSandboxRunnerRequest(
  input: CodeSandboxRequest,
  context?: CodeSandboxExecutionContext,
): Promise<PreparedSandboxRunnerInput> {
  const language = normalizeLanguage(input);
  if (typeof input.code !== "string" || !input.code.trim()) {
    throw new Error("code is required.");
  }
  if (input.code.length > maxSandboxCodeChars) {
    throw new Error(
      `code is too large. Maximum is ${maxSandboxCodeChars} characters.`,
    );
  }

  const rawStdin = typeof input.stdin === "string" ? input.stdin : undefined;
  const stdinFile =
    rawStdin && rawStdin.length > maxSandboxInlineStdinChars
      ? Buffer.from(rawStdin, "utf8")
      : undefined;
  if (stdinFile && stdinFile.byteLength > maxSandboxInputFileBytes) {
    throw new Error(
      `Sandbox standard input is too large. Maximum is ${maxSandboxInputFileBytes} bytes.`,
    );
  }
  const stdin = stdinFile ? undefined : rawStdin;
  const files = normalizeInputFiles(input);
  const baseInputBytes =
    files.reduce((total, file) => total + file.bytes.byteLength, 0) +
    (stdinFile?.byteLength ?? 0);
  if (baseInputBytes > maxSandboxInputTotalBytes) {
    throw new Error(
      `Sandbox inputs are too large. Maximum total is ${maxSandboxInputTotalBytes} bytes.`,
    );
  }
  const attachmentReferences = input.attachments ?? [];
  if (attachmentReferences.length === 0) {
    return {
      ...input,
      language,
      stdin,
      stdinFile,
      files,
      attachments: [],
    };
  }
  if (!context) {
    throw new Error("Sandbox attachment access requires a workspace context.");
  }

  const usedPaths = new Set(files.map((file) => file.path));
  for (const [attachmentIndex, reference] of attachmentReferences.entries()) {
    const { metadata, bytes } = await getChatAttachmentBytes({
      attachmentId: reference.id,
      workspaceId: context.workspaceId,
      userId: context.userId,
    });
    const requestedPath = reference.path?.trim();
    const filePath = uniqueSandboxPath(
      requestedPath || defaultAttachmentPath(metadata),
      usedPaths,
    );
    const remainingAttachments = attachmentReferences.length - attachmentIndex;
    const currentBytes = files.reduce(
      (total, file) => total + file.bytes.byteLength,
      stdinFile?.byteLength ?? 0,
    );
    const fairFileBudget = Math.max(
      1,
      Math.floor((maxSandboxInputFiles - files.length) / remainingAttachments),
    );
    const fairByteBudget = Math.max(
      0,
      Math.floor(
        (maxSandboxInputTotalBytes - currentBytes) / remainingAttachments,
      ),
    );
    const canExtract =
      reference.includeExtractedText !== false &&
      isChatFileAttachment(metadata);
    const extracted = canExtract
      ? await getChatAttachmentExtractedText({
          attachmentId: reference.id,
          workspaceId: context.workspaceId,
          userId: context.userId,
        })
      : null;
    const hasExplorer = Boolean(extracted?.text.trim());
    const explorerReserveBytes = hasExplorer ? 150_000 : 0;
    const originalIncluded =
      bytes.byteLength <= maxSandboxInputFileBytes &&
      bytes.byteLength + explorerReserveBytes <= fairByteBudget &&
      (!hasExplorer || fairFileBudget >= 4);

    if (originalIncluded) {
      files.push({ path: filePath, bytes: Buffer.from(bytes) });
    } else if (!hasExplorer) {
      if (bytes.byteLength > maxSandboxInputFileBytes) {
        throw new Error(`Input file is too large: ${filePath}`);
      }
      throw new Error(
        `Not enough sandbox capacity for input file: ${filePath}`,
      );
    }

    if (!hasExplorer || !extracted) continue;
    const explorerFiles = buildDocumentExplorerFiles({
      filePath,
      fileName: metadata.fileName,
      mimeType: metadata.mimeType,
      markdown: extracted.text,
      maxFiles: Math.max(3, fairFileBudget - (originalIncluded ? 1 : 0)),
      maxBytes: Math.max(
        documentExplorerMetadataReserveBytes,
        fairByteBudget - (originalIncluded ? bytes.byteLength : 0),
      ),
      originalIncluded,
    });
    for (const explorerFile of explorerFiles) {
      files.push({
        path: uniqueSandboxPath(explorerFile.path, usedPaths),
        bytes: Buffer.from(explorerFile.bytes),
      });
    }
  }

  if (files.length > maxSandboxInputFiles) {
    throw new Error(
      `Too many input files after expanding attachments. Maximum is ${maxSandboxInputFiles}.`,
    );
  }
  const totalBytes = files.reduce(
    (total, file) => total + file.bytes.byteLength,
    stdinFile?.byteLength ?? 0,
  );
  if (totalBytes > maxSandboxInputTotalBytes) {
    throw new Error(
      `Input files are too large. Maximum total is ${maxSandboxInputTotalBytes} bytes.`,
    );
  }

  return {
    ...input,
    language,
    stdin,
    stdinFile,
    files,
    attachments: [],
  };
}

function serializeSandboxRunnerRequest(input: PreparedSandboxRunnerInput) {
  return JSON.stringify({
    language: input.language,
    code: input.code,
    stdin: typeof input.stdin === "string" ? input.stdin : undefined,
    stdinFileBase64: input.stdinFile?.toString("base64"),
    timeoutMs: clampTimeoutMs(input.timeoutMs),
    files: input.files.map((file) => ({
      path: file.path,
      contentBase64: file.bytes.toString("base64"),
    })),
  });
}

function parseJsonResponse(body: string) {
  try {
    return JSON.parse(body) as Partial<CodeSandboxResult>;
  } catch {
    return null;
  }
}

function stripEmbeddedContent(file: CodeSandboxOutputFile) {
  const publicFile = { ...file };
  delete publicFile.contentBase64;
  return publicFile;
}

function sandboxOutputFileName(filePath: string) {
  const baseName = path.basename(filePath).trim();
  return baseName || "sandbox-output.bin";
}

function shouldPersistSandboxFile(file: CodeSandboxOutputFile) {
  return Boolean(
    file.contentBase64 && (!file.fromInput || file.modified !== false),
  );
}

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

async function persistSandboxFiles(
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

async function runSandboxRunner(
  input: PreparedSandboxRunnerInput,
  executionId: string,
): Promise<CodeSandboxResult> {
  const body = serializeSandboxRunnerRequest(input);
  const socketPath = resolveSandboxRunnerSocket();
  return new Promise((resolve) => {
    const request = http.request(
      {
        socketPath,
        path: "/run",
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
