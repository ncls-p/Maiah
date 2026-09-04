#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, chmod, chown, mkdir, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import {
  executeProcess,
  prepareRun,
  prepareWorkspace,
  writeRunEntry,
} from "./sandbox-runner.prepare-run.mjs";
import {
  readJsonBody,
  writeInputFiles,
} from "./sandbox-runner.read-json-body.mjs";
import {
  canSwitchUser,
  jsonResponse,
  log,
  maxStdoutFileBytes,
  runRoot,
  socketGid,
  socketPath,
} from "./sandbox-runner.socket-path.mjs";
import { collectFiles } from "./sandbox-runner.collect-output-files.mjs";

async function runSandbox(input) {
  const prepared = await prepareRun(input);
  try {
    const execution = await executeProcess(input, prepared.workdir);
    const completeStdout = execution.stdoutFileTruncated
      ? execution.stdout
      : await readFile(path.join(prepared.workdir, ".stdout"), "utf8");
    const files = await collectFiles(prepared.workdir, prepared.inputHashes);
    return {
      ok:
        execution.exitCode === 0 &&
        !execution.timedOut &&
        !execution.stdoutFileTruncated,
      language: input.language,
      ...execution,
      stdout: completeStdout,
      ...(execution.stdoutFileTruncated
        ? {
            error: `Sandbox standard output exceeded ${maxStdoutFileBytes} bytes.`,
          }
        : {}),
      files,
    };
  } finally {
    await rm(prepared.workdir, { recursive: true, force: true }).catch(
      () => undefined,
    );
  }
}

const sessions = new Map();
const sessionTtlMs = Number(process.env.SANDBOX_SESSION_TTL_MS ?? 5 * 60_000);

async function closeSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return false;
  sessions.delete(sessionId);
  await rm(session.workdir, { recursive: true, force: true }).catch(
    () => undefined,
  );
  return true;
}

async function openSession(input) {
  const prepared = await prepareWorkspace(input.files);
  const sessionId = randomUUID();
  sessions.set(sessionId, { ...prepared, lastUsedAt: Date.now() });
  return sessionId;
}

async function runSession(sessionId, input) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Sandbox session not found or expired.");
  session.lastUsedAt = Date.now();
  const pushedHashes = await writeInputFiles(session.workdir, input.files);
  for (const [filePath, hash] of pushedHashes)
    session.inputHashes.set(filePath, hash);
  await rm(path.join(session.workdir, ".stdout"), { force: true }).catch(
    () => undefined,
  );
  await rm(path.join(session.workdir, ".stdin"), { force: true }).catch(
    () => undefined,
  );
  await writeRunEntry(input, session.workdir);
  try {
    const execution = await executeProcess(input, session.workdir);
    const completeStdout = execution.stdoutFileTruncated
      ? execution.stdout
      : await readFile(path.join(session.workdir, ".stdout"), "utf8");
    const files = await collectFiles(session.workdir, session.inputHashes);
    for (const file of files) {
      if (file.deleted) session.inputHashes.delete(file.path);
      else if (file.hash) session.inputHashes.set(file.path, file.hash);
    }
    return {
      ok:
        execution.exitCode === 0 &&
        !execution.timedOut &&
        !execution.stdoutFileTruncated,
      language: input.language,
      ...execution,
      stdout: completeStdout,
      ...(execution.stdoutFileTruncated
        ? {
            error: `Sandbox standard output exceeded ${maxStdoutFileBytes} bytes.`,
          }
        : {}),
      files,
    };
  } finally {
    await rm(path.join(session.workdir, ".maiah-entry.py"), {
      force: true,
    }).catch(() => undefined);
    await rm(path.join(session.workdir, ".maiah-entry.mjs"), {
      force: true,
    }).catch(() => undefined);
    await rm(path.join(session.workdir, ".maiah-entry.sh"), {
      force: true,
    }).catch(() => undefined);
    await rm(path.join(session.workdir, ".stdin"), { force: true }).catch(
      () => undefined,
    );
    await rm(path.join(session.workdir, ".stdout"), { force: true }).catch(
      () => undefined,
    );
  }
}

const sessionReaper = setInterval(
  () => {
    const cutoff = Date.now() - sessionTtlMs;
    for (const [sessionId, session] of sessions) {
      if (session.lastUsedAt < cutoff) void closeSession(sessionId);
    }
  },
  Math.min(sessionTtlMs, 30_000),
);
sessionReaper.unref();

async function start() {
  await mkdir(path.dirname(socketPath), { recursive: true });
  try {
    await access(socketPath, fsConstants.F_OK);
    await rm(socketPath, { force: true });
  } catch {
    // no stale socket
  }

  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      jsonResponse(response, 200, { status: "ok" });
      return;
    }
    if (request.method === "POST" && request.url === "/sessions") {
      try {
        const input = await readJsonBody(request);
        const sessionId = await openSession(input);
        jsonResponse(response, 201, { sessionId });
      } catch (error) {
        jsonResponse(response, 400, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    const sessionMatch = request.url?.match(/^\/sessions\/([0-9a-f-]+)$/i);
    if (request.method === "DELETE" && sessionMatch) {
      jsonResponse(
        response,
        (await closeSession(sessionMatch[1])) ? 200 : 404,
        { closed: true },
      );
      return;
    }
    const sessionRunMatch = request.url?.match(
      /^\/sessions\/([0-9a-f-]+)\/run$/i,
    );
    if (
      request.method !== "POST" ||
      (request.url !== "/run" && !sessionRunMatch)
    ) {
      jsonResponse(response, 404, { error: "Not found" });
      return;
    }
    const executionId =
      request.headers["x-sandbox-execution-id"]?.toString() ?? randomUUID();
    const startedAt = Date.now();
    try {
      const input = await readJsonBody(request);
      log("info", "sandbox-runner execution started", {
        executionId,
        language: input.language,
        fileCount: input.files.length,
        timeoutMs: input.timeoutMs,
      });
      const result = sessionRunMatch
        ? await runSession(sessionRunMatch[1], input)
        : await runSandbox(input);
      log("info", "sandbox-runner execution completed", {
        executionId,
        language: result.language,
        ok: result.ok,
        exitCode: result.exitCode,
        signal: result.signal,
        timedOut: result.timedOut,
        durationMs: result.durationMs,
        wallDurationMs: Date.now() - startedAt,
        stdoutBytes: Buffer.byteLength(result.stdout),
        stderrBytes: Buffer.byteLength(result.stderr),
        fileCount: result.files.length,
        truncated: result.truncated,
      });
      jsonResponse(response, 200, result);
    } catch (error) {
      log("warn", "sandbox-runner execution rejected", {
        executionId,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      jsonResponse(response, 400, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  server.listen(socketPath, async () => {
    if (canSwitchUser) {
      await chown(socketPath, 0, socketGid).catch(() => undefined);
      await chmod(socketPath, 0o660).catch(() => undefined);
    } else {
      await chmod(socketPath, 0o600).catch(() => undefined);
    }
    log("info", "sandbox-runner listening", { socketPath, runRoot });
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      server.close(async () => {
        await Promise.all([...sessions.keys()].map(closeSession));
        rm(socketPath, { force: true }).finally(() => process.exit(0));
      });
    });
  }
}

if (process.env.SANDBOX_RUNNER_VALIDATE_ONLY !== "true") {
  start().catch((error) => {
    log("error", "sandbox-runner failed to start", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  });
}
