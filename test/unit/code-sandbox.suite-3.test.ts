import { rmSync } from "node:fs";
import { type Server } from "node:http";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/chat/attachments", () => ({
  createChatAttachment: vi.fn(async (input: { fileName: string }) => ({
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
  })),
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
    text: "## Page 1\n\nFirst page\n\n## Page 2\n\nSecond page",
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

let server: Server | undefined;
let socketDir: string | undefined;
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

function close(server: Server) {
  return new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

async function loadSandboxModule() {
  vi.resetModules();
  Object.assign(process.env, validEnv);
  return import("@/modules/tool/code-sandbox");
}

beforeEach(() => {
  Object.assign(process.env, validEnv);
  delete process.env.SANDBOX_RUNNER_SOCKET;
  requests = [];
});

afterEach(async () => {
  if (server) await close(server);
  server = undefined;
  if (socketDir) rmSync(socketDir, { recursive: true, force: true });
  socketDir = undefined;
  delete process.env.SANDBOX_RUNNER_SOCKET;
  vi.resetModules();
});

describe("code sandbox runner client", () => {
  it("validates language, code, input file size, base64, reserved paths, and attachment context", async () => {
    const { executeCodeSandbox } = await loadSandboxModule();
    await expect(
      (executeCodeSandbox as ExecuteCodeSandbox)({
        language: "ruby" as never,
        code: "puts 1",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "language must be 'python', 'node', or 'bash'.",
    });
    await expect(
      (executeCodeSandbox as ExecuteCodeSandbox)({
        language: "node",
        code: "   ",
      }),
    ).resolves.toMatchObject({ ok: false, error: "code is required." });
    await expect(
      (executeCodeSandbox as ExecuteCodeSandbox)({
        language: "node",
        code: "x",
        files: [{ path: "main.mjs", content: "reserved" }],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Reserved sandbox file path.",
    });
    await expect(
      (executeCodeSandbox as ExecuteCodeSandbox)({
        language: "node",
        code: "x",
        files: [{ path: "data.txt", contentBase64: "not-base64" }],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("not valid base64"),
    });
    await expect(
      (executeCodeSandbox as ExecuteCodeSandbox)({
        language: "node",
        code: "x",
        files: [{ path: "huge.txt", content: "x".repeat(1_500_001) }],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("Input file is too large"),
    });
    await expect(
      (executeCodeSandbox as ExecuteCodeSandbox)({
        language: "node",
        code: "x",
        attachments: [{ id: "a" }],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Sandbox attachment access requires a workspace context.",
    });
    expect(requests).toHaveLength(0);
  });
});
