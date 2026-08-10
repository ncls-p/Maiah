import path from "node:path";

import {
  getChatAttachmentBytes,
  getChatAttachmentExtractedText,
  isChatFileAttachment,
} from "@/modules/chat/attachments";
import {
  buildDocumentExplorerFiles,
  uniqueSandboxPath,
} from "./code-sandbox.build-document-explorer-files";
import {
  clampTimeoutMs,
  CodeSandboxExecutionContext,
  CodeSandboxOutputFile,
  CodeSandboxRequest,
  CodeSandboxResult,
  maxSandboxCodeChars,
  maxSandboxInlineStdinChars,
  maxSandboxInputFileBytes,
  maxSandboxInputFiles,
  maxSandboxInputTotalBytes,
  normalizeLanguage,
  PreparedSandboxRunnerInput,
} from "./code-sandbox.code-sandbox-output-file";
import {
  defaultAttachmentPath,
  documentExplorerMetadataReserveBytes,
  normalizeInputFiles,
} from "./code-sandbox.failed-sandbox-result";

export async function prepareSandboxRunnerRequest(
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

export function serializeSandboxRunnerRequest(
  input: PreparedSandboxRunnerInput,
) {
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

export function parseJsonResponse(body: string) {
  try {
    return JSON.parse(body) as Partial<CodeSandboxResult>;
  } catch {
    return null;
  }
}

export function stripEmbeddedContent(file: CodeSandboxOutputFile) {
  const publicFile = { ...file };
  delete publicFile.contentBase64;
  return publicFile;
}

export function sandboxOutputFileName(filePath: string) {
  const baseName = path.basename(filePath).trim();
  return baseName || "sandbox-output.bin";
}

export function shouldPersistSandboxFile(file: CodeSandboxOutputFile) {
  return Boolean(
    file.contentBase64 && (!file.fromInput || file.modified !== false),
  );
}
