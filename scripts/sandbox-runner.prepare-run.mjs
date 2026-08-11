#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, chown, mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { appendLimited, appendTailLimited, chownRecursive, commandForLanguage, executionCommandForLanguage, nodePrelude, writeInputFiles } from "./sandbox-runner.read-json-body.mjs";
import { canSwitchUser, maxStderrBytes, maxStdoutBytes, maxStdoutFileBytes, runRoot, sandboxGid, sandboxUid, textExtensions } from "./sandbox-runner.socket-path.mjs";

export async function prepareRun(input) {
  await mkdir(runRoot, { recursive: true });
  if (canSwitchUser) {
    await chown(runRoot, sandboxUid, sandboxGid).catch(() => undefined);
    await chmod(runRoot, 0o700).catch(() => undefined);
  }
  const runId = randomUUID();
  const workdir = await mkdtemp(path.join(runRoot, `run-${runId}-`));
  await chmod(workdir, 0o700);
  const inputHashes = await writeInputFiles(workdir, input.files);
  if (input.stdinFile) {
    const stdinPath = path.join(workdir, ".stdin");
    await writeFile(stdinPath, input.stdinFile);
    if (canSwitchUser) {
      await chown(stdinPath, sandboxUid, sandboxGid).catch(() => undefined);
    }
  }
  const { entryFile } = commandForLanguage(input.language);
  const source = input.language === "node" ? `${nodePrelude()}\n${input.code}\n` : input.language === "bash" ? `set -euo pipefail\n${input.code}\n` : `${input.code}\n`;
  await writeFile(path.join(workdir, entryFile), source, "utf8");
  if (input.language === "node") {
    await writeFile(path.join(workdir, "package.json"), '{"type":"module"}\n', "utf8");
    await symlink("/opt/sandbox/node_modules", path.join(workdir, "node_modules")).catch(() => undefined);
  }
  await mkdir(path.join(workdir, "tmp"), { recursive: true });
  await mkdir(path.join(workdir, "home"), { recursive: true });
  await chownRecursive(workdir);
  return { runId, workdir, inputHashes };
}

export function executeProcess(input, workdir) {
  const { command, args } = executionCommandForLanguage(input.language);
  const startedAt = Date.now();
  return new Promise((resolve) => {
    let stdout = { buffer: Buffer.alloc(0), truncated: false };
    let stderr = { buffer: Buffer.alloc(0), truncated: false };
    let stdoutFileBytes = 0;
    let stdoutFileTruncated = false;
    let stdoutFileFailed = false;
    let timedOut = false;
    let settled = false;
    const stdoutFile = createWriteStream(path.join(workdir, ".stdout"), {
      flags: "wx",
      mode: 0o600,
    });
    const child = spawn(command, args, {
      cwd: workdir,
      detached: true,
      ...(canSwitchUser ? { uid: sandboxUid, gid: sandboxGid } : {}),
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        PATH: "/usr/local/bin:/usr/bin:/bin",
        HOME: path.join(workdir, "home"),
        TMPDIR: path.join(workdir, "tmp"),
        MPLCONFIGDIR: path.join(workdir, "tmp", "matplotlib"),
        XDG_CACHE_HOME: path.join(workdir, "tmp", "cache"),
        PYTHONDONTWRITEBYTECODE: "1",
        PYTHONUNBUFFERED: "1",
        OPENBLAS_NUM_THREADS: "1",
        OMP_NUM_THREADS: "1",
        MKL_NUM_THREADS: "1",
        NUMEXPR_NUM_THREADS: "1",
        NODE_PATH: "/opt/sandbox/node_modules",
        npm_config_cache: path.join(workdir, "tmp", "npm"),
        HTTP_PROXY: process.env.HTTP_PROXY ?? "",
        HTTPS_PROXY: process.env.HTTPS_PROXY ?? "",
        http_proxy: process.env.http_proxy ?? process.env.HTTP_PROXY ?? "",
        https_proxy: process.env.https_proxy ?? process.env.HTTPS_PROXY ?? "",
        NO_PROXY: "",
        no_proxy: "",
        NODE_USE_ENV_PROXY: "1",
      },
    });
    const stdinStream = input.stdinFile ? createReadStream(path.join(workdir, ".stdin")) : null;
    stdoutFile.on("error", (error) => {
      stdoutFileFailed = true;
      stderr = appendTailLimited(stderr, Buffer.from(`Failed to capture complete stdout: ${error.message}`), maxStderrBytes);
    });

    child.stdout.on("data", (chunk) => {
      stdout = appendLimited(stdout, chunk, maxStdoutBytes);
      if (stdoutFileFailed || stdoutFileTruncated) return;
      const remaining = maxStdoutFileBytes - stdoutFileBytes;
      if (remaining <= 0) {
        stdoutFileTruncated = true;
        return;
      }
      const captured = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk;
      stdoutFileBytes += captured.byteLength;
      stdoutFile.write(captured);
      if (captured.byteLength < chunk.byteLength) {
        stdoutFileTruncated = true;
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendTailLimited(stderr, chunk, maxStderrBytes);
    });
    child.stdin.on("error", (error) => {
      // Short-lived commands may close stdin before Node flushes it. The
      // command's close event remains the source of truth for its result.
      if (error.code === "EPIPE" || error.code === "ERR_STREAM_DESTROYED") {
        stdinStream?.destroy();
        return;
      }
      stderr = appendTailLimited(stderr, Buffer.from(error.message), maxStderrBytes);
    });
    if (stdinStream) {
      stdinStream.on("error", (error) => {
        stderr = appendTailLimited(stderr, Buffer.from(error.message), maxStderrBytes);
        child.stdin.destroy(error);
      });
      stdinStream.pipe(child.stdin);
    } else {
      child.stdin.end(input.stdin);
    }

    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }
    }, input.timeoutMs);

    async function finish(exitCode, signal) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!stdoutFile.closed) {
        await new Promise((close) => {
          stdoutFile.once("close", close);
          stdoutFile.end();
        });
      }
      resolve({
        exitCode: timedOut ? null : exitCode,
        signal: signal ?? null,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout: stdout.buffer.toString("utf8"),
        stderr: stderr.buffer.toString("utf8"),
        stdoutFileTruncated: stdoutFileTruncated || stdoutFileFailed,
        truncated: stdoutFileTruncated || stdoutFileFailed || stderr.truncated,
      });
    }

    child.on("error", (error) => {
      stderr = appendTailLimited(stderr, Buffer.from(error.message), maxStderrBytes);
      finish(127, null);
    });
    child.on("close", finish);
  });
}

export function mimeTypeForPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".json") return "application/json";
  if (extension === ".csv") return "text/csv";
  if (extension === ".html" || extension === ".htm") return "text/html";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".pdf") return "application/pdf";
  if (textExtensions.has(extension)) return "text/plain";
  return "application/octet-stream";
}

export function isProbablyText(bytes, filePath) {
  if (textExtensions.has(path.extname(filePath).toLowerCase())) return true;
  if (bytes.includes(0)) return false;
  return bytes.subarray(0, Math.min(bytes.length, 4096)).every((byte) => byte === 9 || byte === 10 || byte === 13 || byte >= 32);
}
