#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chown, lstat, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { bytesFromBase64, canSwitchUser, canUsePrlimit, clampTimeout, isPlainObject, maxCodeChars, maxCpuSeconds, maxInlineStdinChars, maxInputFileBytes, maxInputFileChars, maxInputFiles, maxInputTotalBytes, maxOutputFileSizeBytes, maxProcesses, maxRequestBytes, pythonCommand, safeRelativePath, sandboxGid, sandboxUid } from "./sandbox-runner.socket-path.mjs";

function validateRunPayload(payload) {
  if (!isPlainObject(payload)) throw new Error("Request body must be an object.");
  const language = payload.language;
  if (language !== "python" && language !== "node" && language !== "bash") {
    throw new Error("language must be 'python', 'node', or 'bash'.");
  }
  if (typeof payload.code !== "string" || !payload.code.trim()) {
    throw new Error("code is required.");
  }
  if (payload.code.length > maxCodeChars) {
    throw new Error(`code is too large. Maximum is ${maxCodeChars} characters.`);
  }
  const stdin = typeof payload.stdin === "string" ? payload.stdin : "";
  if (stdin.length > maxInlineStdinChars) {
    throw new Error(`Inline standard input is too large. Maximum is ${maxInlineStdinChars} characters; use stdinFileBase64 instead.`);
  }
  const stdinFile = typeof payload.stdinFileBase64 === "string" ? bytesFromBase64(payload.stdinFileBase64, ".stdin") : null;
  if (stdin && stdinFile) {
    throw new Error("Use either inline standard input or a standard input file.");
  }
  if (stdinFile && stdinFile.byteLength > maxInputFileBytes) {
    throw new Error(`Standard input file is too large. Maximum is ${maxInputFileBytes} bytes.`);
  }
  const files = Array.isArray(payload.files) ? payload.files : [];
  if (files.length > maxInputFiles) {
    throw new Error(`Too many input files. Maximum is ${maxInputFiles}.`);
  }
  let totalInputBytes = stdinFile?.byteLength ?? 0;
  const normalizedFiles = files.map((file) => {
    if (!isPlainObject(file)) throw new Error("Each file must be an object.");
    const filePath = safeRelativePath(file.path);
    const hasBase64 = typeof file.contentBase64 === "string";
    const textContent = typeof file.content === "string" ? file.content : "";
    if (!hasBase64 && textContent.length > maxInputFileChars) {
      throw new Error(`Input text file is too large: ${filePath}`);
    }
    const bytes = hasBase64 ? bytesFromBase64(file.contentBase64, filePath) : Buffer.from(textContent, "utf8");
    if (bytes.byteLength > maxInputFileBytes) {
      throw new Error(`Input file is too large: ${filePath}`);
    }
    totalInputBytes += bytes.byteLength;
    if (totalInputBytes > maxInputTotalBytes) {
      throw new Error(`Input files are too large. Maximum total is ${maxInputTotalBytes} bytes.`);
    }
    return { path: filePath, bytes };
  });
  return {
    language,
    code: payload.code,
    stdin,
    stdinFile,
    files: normalizedFiles,
    timeoutMs: clampTimeout(payload.timeoutMs),
  };
}

export async function readJsonBody(request) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.byteLength;
    if (totalBytes > maxRequestBytes) {
      throw new Error(`Request body is too large. Maximum is ${maxRequestBytes} bytes.`);
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return validateRunPayload(JSON.parse(raw || "{}"));
}

function hashBytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function writeInputFiles(workdir, files) {
  const hashes = new Map();
  for (const file of files) {
    const target = path.resolve(workdir, file.path);
    if (!target.startsWith(`${workdir}${path.sep}`)) {
      throw new Error("Path traversal is not allowed.");
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.bytes);
    if (canSwitchUser) {
      await chown(target, sandboxUid, sandboxGid).catch(() => undefined);
    }
    hashes.set(file.path, hashBytes(file.bytes));
  }
  return hashes;
}

export async function chownRecursive(target) {
  if (!canSwitchUser) return;
  const stats = await lstat(target).catch(() => null);
  if (!stats) return;
  await chown(target, sandboxUid, sandboxGid).catch(() => undefined);
  if (!stats.isDirectory()) return;
  const entries = await readdir(target, { withFileTypes: true });
  await Promise.all(entries.map((entry) => chownRecursive(path.join(target, entry.name))));
}

export function appendLimited(current, chunk, limit) {
  if (current.buffer.length >= limit) return { ...current, truncated: true };
  const remaining = limit - current.buffer.length;
  const nextChunk = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk;
  return {
    buffer: Buffer.concat([current.buffer, nextChunk]),
    truncated: current.truncated || chunk.byteLength > remaining,
  };
}

export function appendTailLimited(current, chunk, limit) {
  const combined = Buffer.concat([current.buffer, chunk]);
  if (combined.byteLength <= limit) {
    return {
      buffer: combined,
      truncated: current.truncated,
    };
  }
  const headBytes = Math.floor(limit / 2);
  const tailBytes = limit - headBytes;
  return {
    buffer: Buffer.concat([combined.subarray(0, headBytes), combined.subarray(combined.byteLength - tailBytes)]),
    truncated: true,
  };
}

export function commandForLanguage(language) {
  if (language === "python") {
    return {
      command: pythonCommand,
      args: ["-I", "main.py"],
      entryFile: "main.py",
    };
  }
  if (language === "bash") {
    return {
      command: "bash",
      args: ["--noprofile", "--norc", "-e", "-u", "-o", "pipefail", "main.sh"],
      entryFile: "main.sh",
    };
  }
  return {
    command: process.execPath,
    args: ["--no-warnings", "main.mjs"],
    entryFile: "main.mjs",
  };
}

export function executionCommandForLanguage(language) {
  const base = commandForLanguage(language);
  const limitArgs = [];
  if (canSwitchUser && maxProcesses > 0) {
    limitArgs.push(`--nproc=${Math.floor(maxProcesses)}`);
  }
  if (maxOutputFileSizeBytes > 0) {
    limitArgs.push(`--fsize=${Math.floor(maxOutputFileSizeBytes)}`);
  }
  if (maxCpuSeconds > 0) limitArgs.push(`--cpu=${Math.floor(maxCpuSeconds)}`);
  if (!canUsePrlimit || limitArgs.length === 0) return base;
  return {
    ...base,
    command: "prlimit",
    args: [...limitArgs, "--", base.command, ...base.args],
  };
}

export function nodePrelude() {
  return ["import { createRequire } from 'node:module';", "import { fileURLToPath } from 'node:url';", "import path from 'node:path';", "const require = createRequire(import.meta.url);", "const __filename = fileURLToPath(import.meta.url);", "const __dirname = path.dirname(__filename);", "globalThis.require = require;", "globalThis.__filename = __filename;", "globalThis.__dirname = __dirname;", ""].join("\n");
}
