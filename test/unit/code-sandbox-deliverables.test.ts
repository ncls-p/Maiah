import { mkdtempSync, rmSync } from "node:fs";
import http, { type Server } from "node:http";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  createAttachment: async (input: { fileName: string }) => ({
    kind: "chat_file",
    id: `att-${input.fileName}`,
    fileName: input.fileName,
    mimeType: "text/plain",
    size: 1,
    hash: "hash",
    url: `/attachments/${input.fileName}`,
    category: "text",
    extractionStatus: "readable",
    extractedTextChars: 0,
  }),
}));

vi.mock("@/modules/chat/attachments", () => ({
  createChatAttachment: vi.fn((input: { fileName: string }) =>
    state.createAttachment(input),
  ),
  getChatAttachmentBytes: vi.fn(async () => ({
    metadata: {
      kind: "chat_file",
      id: "source-att",
      fileName: "Source File.txt",
      mimeType: "text/plain",
      size: 5,
      hash: "hash",
      url: "/attachments/source",
      category: "text",
      extractionStatus: "readable",
      extractedTextChars: 12,
    },
    bytes: Buffer.from("input"),
  })),
  getChatAttachmentExtractedText: vi.fn(async () => ({
    text: "## Page 1\n\nFirst page",
  })),
  isChatFileAttachment: vi.fn(
    (value: { kind?: string }) => value.kind === "chat_file",
  ),
}));

type ExecuteCodeSandbox =
  (typeof import("@/modules/tool/code-sandbox"))["executeCodeSandbox"];

type RunnerRequest = {
  language: "python" | "node" | "bash";
  code: string;
  stdin?: string;
  stdinFileBase64?: string;
  timeoutMs?: number;
  files?: Array<{ path: string; contentBase64?: string; content?: string }>;
};

type RunnerResponse = Record<string, unknown>;

type RunnerHandler = (request: RunnerRequest) => RunnerResponse;

let server: Server | undefined;
let socketDir: string | undefined;
let socketPath: string | undefined;
let requests: RunnerRequest[] = [];

const validEnv = {
  NODE_ENV: "test",
  BETTER_AUTH_SECRET: "test-secret",
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_TRUSTED_ORIGINS: "http://localhost:3000",
  DATABASE_URL: "postgres://localhost/test",
  APP_ENCRYPTION_KEY:
    "0000000000000000000000000000000000000000000000000000000000000000",
  OBJECT_STORAGE_BUCKET: "test",
  OBJECT_STORAGE_ACCESS_KEY_ID: "test",
  OBJECT_STORAGE_SECRET_ACCESS_KEY: "test",
};

function listen(server: Server, socketPath: string) {
  return new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server: Server) {
  return new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

async function startFakeRunner(handler: RunnerHandler) {
  socketDir = mkdtempSync(path.join(os.tmpdir(), "ai-hub-runner-test-"));
  socketPath = path.join(socketDir, "sandbox.sock");
  requests = [];
  server = http.createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (request.method !== "POST" || request.url !== "/run") {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Not found" }));
      return;
    }
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const payload = JSON.parse(
        Buffer.concat(chunks).toString("utf8"),
      ) as RunnerRequest;
      requests.push(payload);
      const body = JSON.stringify(handler(payload));
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      });
      response.end(body);
    });
  });
  await listen(server, socketPath);
  process.env.SANDBOX_RUNNER_SOCKET = socketPath;
  return socketPath;
}

async function loadSandboxModule() {
  vi.resetModules();
  Object.assign(process.env, validEnv);
  return import("@/modules/tool/code-sandbox");
}

function runResult(
  files: RunnerResponse["files"],
  overrides: Partial<RunnerResponse> = {},
) {
  return {
    ok: true,
    language: "python",
    exitCode: 0,
    signal: null,
    timedOut: false,
    durationMs: 12,
    stdout: "",
    stderr: "",
    truncated: false,
    files,
    ...overrides,
  };
}

beforeEach(() => {
  Object.assign(process.env, validEnv);
  delete process.env.SANDBOX_RUNNER_SOCKET;
  requests = [];
  state.createAttachment = async (input: { fileName: string }) => ({
    kind: "chat_file",
    id: `att-${input.fileName}`,
    fileName: input.fileName,
    mimeType: "text/plain",
    size: 1,
    hash: "hash",
    url: `/attachments/${input.fileName}`,
    category: "text",
    extractionStatus: "readable",
    extractedTextChars: 0,
  });
});

afterEach(async () => {
  if (server) await close(server);
  server = undefined;
  if (socketDir) rmSync(socketDir, { recursive: true, force: true });
  socketDir = undefined;
  socketPath = undefined;
  delete process.env.SANDBOX_RUNNER_SOCKET;
  vi.resetModules();
});

describe("code sandbox deliverables", () => {
  it("persists every generated file with a working download URL", async () => {
    await startFakeRunner(() =>
      runResult([
        {
          path: "charts/report.png",
          size: 120,
          mimeType: "image/png",
          contentBase64: Buffer.from("png-bytes").toString("base64"),
        },
        {
          path: "summary.md",
          size: 10,
          mimeType: "text/markdown",
          textPreview: "done",
          contentBase64: Buffer.from("done").toString("base64"),
        },
      ]),
    );
    const { executeCodeSandbox } = await loadSandboxModule();

    const result = await (executeCodeSandbox as ExecuteCodeSandbox)(
      { language: "python", code: "print('ok')" },
      { workspaceId: "ws-1", userId: "user-1" },
    );

    expect(result.ok).toBe(true);
    const chart = result.files.find((file) => file.path === "charts/report.png");
    const summary = result.files.find((file) => file.path === "summary.md");
    expect(chart).toMatchObject({
      downloadUrl: "/attachments/report.png",
      attachment: expect.objectContaining({ url: "/attachments/report.png" }),
    });
    expect(summary).toMatchObject({
      downloadUrl: "/attachments/summary.md",
      attachment: expect.objectContaining({ url: "/attachments/summary.md" }),
    });
    for (const file of result.files) {
      expect(file).not.toHaveProperty("contentBase64");
      expect(file.downloadUrl).toBe(file.attachment?.url);
    }
  });

  it("keeps unchanged inputs un-persisted and modified inputs downloadable", async () => {
    await startFakeRunner(() =>
      runResult([
        {
          path: "data/input.txt",
          size: 5,
          mimeType: "text/plain",
          fromInput: true,
          modified: false,
          contentBase64: Buffer.from("hello").toString("base64"),
        },
        {
          path: "data/notes.txt",
          size: 6,
          mimeType: "text/plain",
          fromInput: true,
          modified: true,
          contentBase64: Buffer.from("edited").toString("base64"),
        },
      ]),
    );
    const { executeCodeSandbox } = await loadSandboxModule();

    const result = await (executeCodeSandbox as ExecuteCodeSandbox)(
      {
        language: "python",
        code: "print('ok')",
        files: [
          { path: "data/input.txt", content: "hello" },
          { path: "data/notes.txt", content: "original" },
        ],
      },
      { workspaceId: "ws-1", userId: "user-1" },
    );

    const unchanged = result.files.find((file) =>
      file.path.endsWith("input.txt"),
    );
    const modified = result.files.find((file) =>
      file.path.endsWith("notes.txt"),
    );
    expect(unchanged).toMatchObject({ fromInput: true, modified: false });
    expect(unchanged).not.toHaveProperty("downloadUrl");
    expect(unchanged).not.toHaveProperty("attachment");
    expect(modified).toMatchObject({
      fromInput: true,
      modified: true,
      downloadUrl: "/attachments/notes.txt",
    });
  });

  it("returns an empty file list when the run generates nothing", async () => {
    await startFakeRunner(() => runResult([]));
    const { executeCodeSandbox } = await loadSandboxModule();

    const result = await (executeCodeSandbox as ExecuteCodeSandbox)(
      { language: "python", code: "print('ok')" },
      { workspaceId: "ws-1", userId: "user-1" },
    );

    expect(result.ok).toBe(true);
    expect(result.files).toEqual([]);
  });

  it("keeps oversized and omitted files visible with their reason and no link", async () => {
    await startFakeRunner(() =>
      runResult([
        {
          path: "big.txt",
          size: 9_000_000,
          mimeType: "text/plain",
          skipped: "too_large",
        },
        {
          path: "omitted.txt",
          size: 40,
          mimeType: "text/plain",
          contentOmitted: "total_limit",
        },
        {
          path: "small.txt",
          size: 5,
          mimeType: "text/plain",
          contentBase64: Buffer.from("small").toString("base64"),
        },
      ]),
    );
    const { executeCodeSandbox } = await loadSandboxModule();

    const result = await (executeCodeSandbox as ExecuteCodeSandbox)(
      { language: "python", code: "print('ok')" },
      { workspaceId: "ws-1", userId: "user-1" },
    );

    const big = result.files.find((file) => file.path === "big.txt");
    const omitted = result.files.find((file) => file.path === "omitted.txt");
    const small = result.files.find((file) => file.path === "small.txt");
    expect(big).toMatchObject({ skipped: "too_large" });
    expect(big).not.toHaveProperty("downloadUrl");
    expect(big).not.toHaveProperty("downloadError");
    expect(omitted).toMatchObject({ contentOmitted: "total_limit" });
    expect(omitted).not.toHaveProperty("downloadUrl");
    expect(small).toMatchObject({ downloadUrl: "/attachments/small.txt" });
  });

  it("reports persistence failures without a fake download link", async () => {
    state.createAttachment = async () => {
      throw new Error("object storage unavailable");
    };
    await startFakeRunner(() =>
      runResult([
        {
          path: "report.txt",
          size: 8,
          mimeType: "text/plain",
          contentBase64: Buffer.from("report").toString("base64"),
        },
      ]),
    );
    const { executeCodeSandbox } = await loadSandboxModule();

    const result = await (executeCodeSandbox as ExecuteCodeSandbox)(
      { language: "python", code: "print('ok')" },
      { workspaceId: "ws-1", userId: "user-1" },
    );

    expect(result.ok).toBe(true);
    const file = result.files[0];
    expect(file).toMatchObject({ downloadError: "object storage unavailable" });
    expect(file).not.toHaveProperty("downloadUrl");
    expect(file).not.toHaveProperty("attachment");
  });

  it("keeps files downloadable when the execution itself fails", async () => {
    await startFakeRunner(() =>
      runResult(
        [
          {
            path: "report.txt",
            size: 8,
            mimeType: "text/plain",
            contentBase64: Buffer.from("report").toString("base64"),
          },
        ],
        {
          ok: false,
          exitCode: 1,
          stderr: "Traceback (most recent call last):\n  File \"main.py\", line 1",
        },
      ),
    );
    const { executeCodeSandbox } = await loadSandboxModule();

    const result = await (executeCodeSandbox as ExecuteCodeSandbox)(
      { language: "python", code: "raise ValueError('boom')" },
      { workspaceId: "ws-1", userId: "user-1" },
    );

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Traceback");
    expect(result.files[0]).toMatchObject({
      downloadUrl: "/attachments/report.txt",
      attachment: expect.objectContaining({ url: "/attachments/report.txt" }),
    });
  });
});