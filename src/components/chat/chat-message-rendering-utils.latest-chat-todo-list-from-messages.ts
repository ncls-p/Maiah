import {
  parseToolPart,
  toolNameMatches,
  type ChatFileAttachment,
  type ChatImageAttachment,
  type ChatMessage,
  type ChatMessagePart,
  type PendingToolApproval,
} from "@/components/chat/chat-types";
import { isCodeWorkspaceArtifactOutput } from "@/components/chat/code-workspace-artifact-card";
import { summarizeToolInput } from "@/components/chat/tool-approval-banner";
import {
  chatTodoListFromUnknown,
  type ChatTodoList,
} from "@/modules/chat/todo-list";
import { projectToolPayloadForDisplay } from "@/modules/tool/safe-payload";
import { chatTodoListFromToolPart } from "./chat-message-rendering-utils.stringify-for-match";


export function latestChatTodoListFromMessages(
  messages: ChatMessage[],
): ChatTodoList | null {
  let latestTodoList: ChatTodoList | null = null;

  for (const message of messages) {
    for (const part of message.parts) {
      const todoList = chatTodoListFromToolPart(part);
      if (todoList) latestTodoList = todoList;
    }
  }

  return latestTodoList;
}

export function codeWorkspaceArtifactFromPartContent(content: string) {
  try {
    const parsed = JSON.parse(content) as unknown;
    return isCodeWorkspaceArtifactOutput(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isChatImageAttachmentOutput(
  value: unknown,
): value is ChatImageAttachment {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === "chat_image" &&
    typeof record.id === "string" &&
    typeof record.fileName === "string" &&
    typeof record.mimeType === "string" &&
    typeof record.url === "string"
  );
}

export function chatImageAttachmentFromPartContent(content: string) {
  try {
    const parsed = JSON.parse(content) as unknown;
    return isChatImageAttachmentOutput(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isChatFileAttachmentOutput(
  value: unknown,
): value is ChatFileAttachment {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === "chat_file" &&
    typeof record.id === "string" &&
    typeof record.fileName === "string" &&
    typeof record.mimeType === "string" &&
    typeof record.url === "string" &&
    typeof record.extractionStatus === "string" &&
    typeof record.extractedTextChars === "number"
  );
}

export function chatFileAttachmentFromPartContent(content: string) {
  try {
    const parsed = JSON.parse(content) as unknown;
    return isChatFileAttachmentOutput(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export type CodeSandboxFileOutput = {
  path: string;
  size: number;
  mimeType: string;
  textPreview?: string;
  truncated?: boolean;
  contentOmitted?: "too_large" | "total_limit";
  downloadUrl?: string;
  downloadError?: string;
  attachment?: ChatFileAttachment | ChatImageAttachment;
  fromInput?: boolean;
  modified?: boolean;
};

export type CodeSandboxLanguage = "python" | "node" | "bash";

export type CodeSandboxOutput = {
  kind: "code_sandbox_result";
  ok: boolean;
  language: CodeSandboxLanguage;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  files: CodeSandboxFileOutput[];
};

export type CodeSandboxInputPreview = {
  language: CodeSandboxLanguage | null;
  code: string;
  files: Array<{ path: string }>;
  attachments: Array<{ id: string; path?: string }>;
};

function isCodeSandboxFileOutput(
  value: unknown,
): value is CodeSandboxFileOutput {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.path === "string" &&
    typeof record.size === "number" &&
    typeof record.mimeType === "string"
  );
}

function normalizeSandboxAttachment(
  value: unknown,
): ChatFileAttachment | ChatImageAttachment | undefined {
  if (isChatFileAttachmentOutput(value) || isChatImageAttachmentOutput(value)) {
    return value;
  }
  return undefined;
}

function normalizeSandboxFileOutput(
  value: unknown,
): CodeSandboxFileOutput | null {
  if (!isCodeSandboxFileOutput(value)) return null;
  const record = value as Record<string, unknown>;
  return {
    path: value.path,
    size: value.size,
    mimeType: value.mimeType,
    ...(typeof record.textPreview === "string"
      ? { textPreview: record.textPreview }
      : {}),
    ...(typeof record.truncated === "boolean"
      ? { truncated: record.truncated }
      : {}),
    ...(record.contentOmitted === "too_large" ||
    record.contentOmitted === "total_limit"
      ? { contentOmitted: record.contentOmitted }
      : {}),
    ...(typeof record.downloadUrl === "string"
      ? { downloadUrl: record.downloadUrl }
      : {}),
    ...(typeof record.downloadError === "string"
      ? { downloadError: record.downloadError }
      : {}),
    ...(normalizeSandboxAttachment(record.attachment)
      ? { attachment: normalizeSandboxAttachment(record.attachment) }
      : {}),
    ...(typeof record.fromInput === "boolean"
      ? { fromInput: record.fromInput }
      : {}),
    ...(typeof record.modified === "boolean"
      ? { modified: record.modified }
      : {}),
  };
}

export function partitionCodeSandboxFiles(files: CodeSandboxFileOutput[]) {
  const inputFiles: CodeSandboxFileOutput[] = [];
  const outputFiles: CodeSandboxFileOutput[] = [];

  for (const file of files) {
    if (file.fromInput && !file.modified) inputFiles.push(file);
    else outputFiles.push(file);
  }

  return { inputFiles, outputFiles };
}

function isCodeSandboxOutput(value: unknown): value is CodeSandboxOutput {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === "code_sandbox_result" &&
    typeof record.ok === "boolean" &&
    (record.language === "python" ||
      record.language === "node" ||
      record.language === "bash") &&
    Array.isArray(record.files)
  );
}

export function codeSandboxOutputFromUnknown(
  value: unknown,
): CodeSandboxOutput | null {
  if (!isCodeSandboxOutput(value)) return null;
  const record = value as Record<string, unknown>;
  return {
    kind: "code_sandbox_result",
    ok: value.ok,
    language: value.language,
    exitCode: typeof record.exitCode === "number" ? record.exitCode : null,
    timedOut: record.timedOut === true,
    durationMs: typeof record.durationMs === "number" ? record.durationMs : 0,
    stdout: typeof record.stdout === "string" ? record.stdout : "",
    stderr: typeof record.stderr === "string" ? record.stderr : "",
    files: value.files.flatMap((file) => {
      const normalized = normalizeSandboxFileOutput(file);
      return normalized ? [normalized] : [];
    }),
  };
}
