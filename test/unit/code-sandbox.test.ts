import { mkdtempSync,rmSync } from "node:fs";
import http,{ type Server } from "node:http";
import os from "node:os";
import path from "node:path";

import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";

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
	socketPath = undefined;
	delete process.env.SANDBOX_RUNNER_SOCKET;
	vi.resetModules();
});

describe("code sandbox runner client", () => {
	it("runs Node.js code through the sandbox runner and returns generated files", async () => {
		await startFakeRunner(() => ({
			ok: true,
			language: "node",
			exitCode: 0,
			signal: null,
			timedOut: false,
			durationMs: 12,
			stdout: "1,4,9\n",
			stderr: "",
			truncated: false,
			files: [
				{
					path: "result.txt",
					size: 13,
					mimeType: "text/plain",
					textPreview: "squares=1,4,9",
					modified: true,
					contentBase64: Buffer.from("squares=1,4,9").toString("base64"),
				},
			],
		}));
		const { executeCodeSandbox } = await loadSandboxModule();

		const result = await (executeCodeSandbox as ExecuteCodeSandbox)({
			language: "node",
			code: [
				'const fs = require("node:fs");',
				'console.log([1, 2, 3].map((value) => value * value).join(","));',
				'fs.writeFileSync("result.txt", "squares=1,4,9");',
			].join("\n"),
			files: [{ path: "data/input.txt", content: "hello" }],
		});

		expect(result.ok).toBe(true);
		expect(result.stdout.trim()).toBe("1,4,9");
		expect(result.files).toContainEqual(
			expect.objectContaining({
				path: "result.txt",
				textPreview: "squares=1,4,9",
				modified: true,
			}),
		);
		expect(result.files[0]).not.toHaveProperty("contentBase64");
		expect(requests).toHaveLength(1);
		expect(requests[0]).toMatchObject({
			language: "node",
			timeoutMs: 15_000,
		});
		expect(requests[0]?.files?.[0]).toEqual({
			path: "data/input.txt",
			contentBase64: Buffer.from("hello").toString("base64"),
		});
	});

	it("rejects unsafe input file paths before contacting the runner", async () => {
		const { executeCodeSandbox } = await loadSandboxModule();

		const result = await (executeCodeSandbox as ExecuteCodeSandbox)({
			language: "node",
			code: "console.log('nope')",
			files: [{ path: "../outside.txt", content: "secret" }],
		});

		expect(result.ok).toBe(false);
		expect(result.error).toMatch(/Path traversal/i);
		expect(requests).toHaveLength(0);
	});

	it("transports large standard input through a sandbox file", async () => {
		const largeInput = JSON.stringify({ body: "x".repeat(150_000) });
		await startFakeRunner((request) => {
			expect(request.stdin).toBeUndefined();
			expect(
				Buffer.from(request.stdinFileBase64 ?? "", "base64").toString("utf8"),
			).toBe(largeInput);
			return {
				ok: true,
				language: "node",
				exitCode: 0,
				signal: null,
				timedOut: false,
				durationMs: 5,
				stdout: '{"received":true}',
				stderr: "",
				truncated: false,
				files: [],
			};
		});
		const { executeCodeSandbox } = await loadSandboxModule();

		const result = await (executeCodeSandbox as ExecuteCodeSandbox)({
			language: "node",
			code: "console.log('{}')",
			stdin: largeInput,
		});

		expect(result.ok).toBe(true);
		expect(result.stdout).toContain("received");
	});

	it("returns an actionable error when the sandbox runner is unavailable", async () => {
		const missingSocketDir = mkdtempSync(
			path.join(os.tmpdir(), "ai-hub-missing-runner-"),
		);
		process.env.SANDBOX_RUNNER_SOCKET = path.join(
			missingSocketDir,
			"missing.sock",
		);
		const { executeCodeSandbox } = await loadSandboxModule();

		const result = await (executeCodeSandbox as ExecuteCodeSandbox)({
			language: "bash",
			code: "echo ok",
		});

		expect(result.ok).toBe(false);
		expect(result.stderr).toContain("Sandbox runner unavailable");
		expect(result.stderr).toContain("missing.sock");
		rmSync(missingSocketDir, { recursive: true, force: true });
	});
});
