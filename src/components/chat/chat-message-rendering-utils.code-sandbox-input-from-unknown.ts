import {
  CodeSandboxInputPreview,
  CodeSandboxLanguage,
} from "./chat-message-rendering-utils.latest-chat-todo-list-from-messages";
import { HtmlArtifactOutput } from "./chat-message-rendering-utils.stringify-for-match";

function normalizeCodeSandboxLanguage(
  value: unknown,
): CodeSandboxLanguage | null {
  return value === "python" || value === "node" || value === "bash"
    ? value
    : null;
}

export function codeSandboxInputFromUnknown(
  value: unknown,
): CodeSandboxInputPreview | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.code !== "string") return null;
  const files = Array.isArray(record.files)
    ? record.files.flatMap((file) => {
        if (typeof file !== "object" || file === null) return [];
        const fileRecord = file as Record<string, unknown>;
        return typeof fileRecord.path === "string"
          ? [{ path: fileRecord.path }]
          : [];
      })
    : [];
  const attachments = Array.isArray(record.attachments)
    ? record.attachments.flatMap((attachment) => {
        if (typeof attachment !== "object" || attachment === null) return [];
        const attachmentRecord = attachment as Record<string, unknown>;
        return typeof attachmentRecord.id === "string"
          ? [
              {
                id: attachmentRecord.id,
                ...(typeof attachmentRecord.path === "string"
                  ? { path: attachmentRecord.path }
                  : {}),
              },
            ]
          : [];
      })
    : [];
  return {
    language: normalizeCodeSandboxLanguage(record.language),
    code: record.code,
    showToUser: record.showToUser === true,
    files,
    attachments,
  };
}

export function isCodeSandboxToolName(toolName: string | undefined) {
  return (
    toolName === "run_code_sandbox" ||
    Boolean(toolName?.endsWith("_run_code_sandbox"))
  );
}

export function shouldShowCodeSandboxToUser(
  input: unknown,
  inputText?: string,
) {
  const parsedInput = codeSandboxInputFromUnknown(input);
  if (parsedInput) return parsedInput.showToUser;
  if (!inputText) return false;
  try {
    return (
      codeSandboxInputFromUnknown(JSON.parse(inputText))?.showToUser === true
    );
  } catch {
    return /"showToUser"\s*:\s*true(?:\s*[,}])?/.test(inputText);
  }
}

export function htmlArtifactFromToolInput(
  value: unknown,
): HtmlArtifactOutput | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.html !== "string") return null;
  return {
    kind: "html_artifact",
    title:
      typeof record.title === "string" ? record.title : "Interactive preview",
    html: record.html,
    css: typeof record.css === "string" ? record.css : "",
    js: typeof record.js === "string" ? record.js : "",
    height: typeof record.height === "number" ? record.height : 420,
  };
}

function decodeJsonStringFragment(raw: string) {
  const safeRaw = raw.endsWith("\\") ? raw.slice(0, -1) : raw;
  try {
    return JSON.parse(`"${safeRaw}"`) as string;
  } catch {
    return safeRaw
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
}

function extractJsonStringField(inputText: string, field: string) {
  const fieldIndex = inputText.indexOf(`"${field}"`);
  if (fieldIndex === -1) return null;
  const colonIndex = inputText.indexOf(":", fieldIndex);
  if (colonIndex === -1) return null;
  const valueStart = inputText.indexOf('"', colonIndex + 1);
  if (valueStart === -1) return null;

  let escaped = false;
  let raw = "";
  for (let index = valueStart + 1; index < inputText.length; index += 1) {
    const char = inputText[index];
    if (escaped) {
      raw += `\\${char}`;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') break;
    raw += char;
  }
  if (escaped) raw += "\\";
  return decodeJsonStringFragment(raw);
}

export function codeSandboxInputFromInputText(inputText: string | undefined) {
  if (!inputText) return null;
  try {
    return codeSandboxInputFromUnknown(JSON.parse(inputText));
  } catch {
    const code = extractJsonStringField(inputText, "code");
    if (!code) return null;
    return {
      language: normalizeCodeSandboxLanguage(
        extractJsonStringField(inputText, "language"),
      ),
      code,
      showToUser: /"showToUser"\s*:\s*true(?:\s*[,}])?/.test(inputText),
      files: [],
      attachments: [],
    };
  }
}

export function htmlArtifactFromInputText(inputText: string | undefined) {
  if (!inputText) return null;
  try {
    return htmlArtifactFromToolInput(JSON.parse(inputText));
  } catch {
    const html = extractJsonStringField(inputText, "html");
    if (!html) return null;
    const heightMatch = inputText.match(/"height"\s*:\s*(\d+)/);
    return {
      kind: "html_artifact" as const,
      title:
        extractJsonStringField(inputText, "title") ?? "Generating preview…",
      html,
      css: extractJsonStringField(inputText, "css") ?? "",
      js: extractJsonStringField(inputText, "js") ?? "",
      height: heightMatch ? Number(heightMatch[1]) : 420,
    };
  }
}
