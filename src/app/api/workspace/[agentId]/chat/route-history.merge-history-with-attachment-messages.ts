import { and, desc, eq, inArray } from "drizzle-orm";

import {
  getChatImageAttachmentBytes,
  isChatFileAttachment,
  isChatImageAttachment,
} from "@/modules/chat/attachments";
import { decryptValue } from "@/lib/crypto";
import { logHandledWarning } from "@/lib/logger";
import { db } from "@/server/infrastructure/db";
import { messageParts, messages } from "@/server/infrastructure/db/schema";
import { projectAgentProgressForModelHistory } from "@/modules/agent/progress-model-history";
import type { ModelMessage } from "ai";

const previousToolTextContextChars = 4_000;

type HistoryMessageRow = {
  id: string;
  role: string;
  createdAt: Date;
};

export function mergeHistoryWithAttachmentMessages(
  recentMessages: HistoryMessageRow[],
  attachmentMessages: HistoryMessageRow[],
) {
  const messagesById = new Map<string, HistoryMessageRow>();
  for (const message of [...attachmentMessages, ...recentMessages]) {
    messagesById.set(message.id, message);
  }
  return [...messagesById.values()].sort(
    (left, right) =>
      left.createdAt.getTime() - right.createdAt.getTime() ||
      left.id.localeCompare(right.id),
  );
}

function htmlArtifactCodeFromValue(value: unknown) {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.kind !== "html_artifact" && record.kind !== undefined) return null;
  const html = record.html;
  if (typeof html !== "string") return null;
  const source = {
    title: record.title,
    html,
    css: record.css,
    js: record.js,
    deck: record.deck,
  };

  const sections = [
    `Title: ${typeof source.title === "string" ? source.title : "Interactive preview"}`,
  ];
  if (source.deck && typeof source.deck === "object") {
    sections.push("Deck JSON:", JSON.stringify(source.deck, null, 2));
  }
  sections.push(
    "HTML:",
    source.html,
    "CSS:",
    typeof source.css === "string" ? source.css : "",
    "JavaScript:",
    typeof source.js === "string" ? source.js : "",
  );
  return sections.join("\n");
}

export function htmlArtifactCodeFromToolMetadata(metadata: unknown) {
  if (typeof metadata !== "object" || metadata === null) return null;
  const record = metadata as Record<string, unknown>;
  return (
    htmlArtifactCodeFromValue(record.input) ??
    htmlArtifactCodeFromValue(record.output)
  );
}

export function sandboxAttachmentPathHint(fileName: string) {
  const baseName =
    fileName
      .replace(/\\/g, "/")
      .split("/")
      .pop()
      ?.replace(/[^a-zA-Z0-9._ -]/g, "_")
      .replace(/^\.+/, "")
      .trim()
      .slice(0, 120) || "attachment.bin";
  return `attachments/${baseName}`;
}

export function sandboxAttachmentExplorerPathHint(fileName: string) {
  const originalPath = sandboxAttachmentPathHint(fileName);
  const slashIndex = originalPath.lastIndexOf("/");
  const directory = originalPath.slice(0, slashIndex + 1);
  const baseName = originalPath.slice(slashIndex + 1);
  const extensionIndex = baseName.lastIndexOf(".");
  const stem =
    extensionIndex > 0 ? baseName.slice(0, extensionIndex) : baseName;
  return `${directory}${stem}.document/README.md`;
}

function truncatePreviousToolContext(value: string) {
  const normalized = value.trim();
  if (normalized.length <= previousToolTextContextChars) return normalized;
  return `${normalized.slice(0, previousToolTextContextChars)}\n… truncated`;
}

function sandboxAttachmentContext(attachment: unknown) {
  if (!isChatFileAttachment(attachment) && !isChatImageAttachment(attachment)) {
    return null;
  }
  return [
    `Attachment ID: ${attachment.id}`,
    `file name: ${attachment.fileName}`,
    `sandbox path hint: ${sandboxAttachmentPathHint(attachment.fileName)}`,
  ].join("; ");
}

function sandboxTextContext(label: string, value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? `${label}:\n${truncatePreviousToolContext(trimmed)}` : null;
}

function codeSandboxFileContextLine(file: unknown) {
  if (typeof file !== "object" || file === null) return null;
  const fileRecord = file as Record<string, unknown>;
  if (typeof fileRecord.path !== "string") return null;
  const details = [
    typeof fileRecord.mimeType === "string" ? fileRecord.mimeType : null,
    typeof fileRecord.size === "number" ? `${fileRecord.size} bytes` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const attachmentContext = sandboxAttachmentContext(fileRecord.attachment);
  return `- ${fileRecord.path}${details ? ` (${details})` : ""}${attachmentContext ? ` — ${attachmentContext}` : ""}`;
}

function codeSandboxFilesContext(files: unknown) {
  if (!Array.isArray(files) || files.length === 0) return [];
  const lines = files.slice(0, 12).flatMap((file) => {
    const line = codeSandboxFileContextLine(file);
    return line ? [line] : [];
  });
  if (files.length > 12) lines.push(`- … ${files.length - 12} more file(s)`);
  return lines.length > 0 ? ["Generated files:", ...lines] : [];
}

function codeSandboxContextFromValue(value: unknown) {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.kind !== "code_sandbox_result") return null;

  const lines = [
    `Previous code sandbox result (${typeof record.language === "string" ? record.language : "unknown"}, ${record.ok === false ? "failed" : "ok"}).`,
    "If the user asks to inspect or modify one of these generated files, call run_code_sandbox with its Attachment ID in the attachments array; do not ask the user to re-upload it.",
    sandboxTextContext("stdout", record.stdout),
    sandboxTextContext("stderr", record.stderr),
    ...codeSandboxFilesContext(record.files),
  ].filter(Boolean);

  return lines.join("\n");
}

export function codeSandboxContextFromToolMetadata(metadata: unknown) {
  if (typeof metadata !== "object" || metadata === null) return null;
  const record = metadata as Record<string, unknown>;
  return (
    codeSandboxContextFromValue(record.output) ??
    codeSandboxContextFromValue(record)
  );
}

function codeWorkspaceContextFromValue(value: unknown) {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.kind !== "code_workspace_artifact") return null;
  if (typeof record.projectId !== "string") return null;
  const files = Array.isArray(record.files)
    ? record.files
        .map((file) => {
          if (typeof file !== "object" || file === null) return null;
          const fileRecord = file as Record<string, unknown>;
          return typeof fileRecord.path === "string"
            ? `- ${fileRecord.path}${fileRecord.binary ? " (asset)" : ""}`
            : null;
        })
        .filter(Boolean)
        .join("\n")
    : "";
  return [
    `Code workspace ID: ${record.projectId}`,
    `Title: ${typeof record.title === "string" ? record.title : "Code workspace"}`,
    `Preview entry: ${typeof record.rootFile === "string" ? record.rootFile : "none"}`,
    files ? `Files:\n${files}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function codeWorkspaceContextFromToolMetadata(metadata: unknown) {
  if (typeof metadata !== "object" || metadata === null) return null;
  const record = metadata as Record<string, unknown>;
  return (
    codeWorkspaceContextFromValue(record) ??
    codeWorkspaceContextFromValue(record.input) ??
    codeWorkspaceContextFromValue(record.output)
  );
}

export async function toolMetadataForModelHistory(part: {
  type: string;
  contentEncrypted: string | null;
  metadataJson: unknown;
}) {
  if (
    (part.type === "tool-call" || part.type === "tool-result") &&
    part.contentEncrypted
  ) {
    try {
      return JSON.parse(await decryptValue(part.contentEncrypted)) as unknown;
    } catch {
      return part.metadataJson;
    }
  }
  return part.metadataJson;
}
