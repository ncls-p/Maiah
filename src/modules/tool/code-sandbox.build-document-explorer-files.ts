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
  DocumentExplorerFile,
  documentExplorerMetadataReserveBytes,
  documentExplorerRootPath,
  safeRelativePath,
} from "./code-sandbox.failed-sandbox-result";
import {
  groupDocumentUnits,
  groupTitle,
  safeDocumentChunkSlug,
  utf8Prefix,
} from "./code-sandbox.group-document-units";
import { maxSandboxInputFileBytes } from "./code-sandbox.code-sandbox-output-file";

export function buildDocumentExplorerFiles(input: {
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

export function uniqueSandboxPath(filePath: string, usedPaths: Set<string>) {
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
