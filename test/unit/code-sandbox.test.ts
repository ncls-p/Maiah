import { beforeEach, describe, expect, it, vi } from "vitest";

const opensandboxMock = vi.hoisted(() => ({
	create: vi.fn(),
	connectionConfig: vi.fn(function ConnectionConfig(
		this: { options?: unknown },
		options,
	) {
		this.options = options;
	}),
}));

vi.mock("@alibaba-group/opensandbox", () => ({
	ConnectionConfig: opensandboxMock.connectionConfig,
	Sandbox: { create: opensandboxMock.create },
}));

type ExecuteCodeSandbox =
	typeof import("@/modules/tool/code-sandbox")["executeCodeSandbox"];

type FakeFile = {
	path: string;
	content: string | Buffer;
	mimeSize?: number;
};

function fakeSandbox(options: {
	exitCode?: number | null;
	stdout?: string;
	stderr?: string;
	files?: FakeFile[];
}) {
	const writtenFiles = new Map<string, Buffer>();
	const outputFiles = new Map(
		(options.files ?? []).map((file) => [
			file.path,
			Buffer.isBuffer(file.content)
				? file.content
				: Buffer.from(file.content, "utf8"),
		]),
	);
	const sandbox = {
		files: {
			createDirectories: vi.fn().mockResolvedValue(undefined),
			writeFiles: vi.fn().mockImplementation(async (entries) => {
				for (const entry of entries) {
					writtenFiles.set(entry.path, Buffer.from(entry.data));
				}
			}),
			listDirectory: vi.fn().mockImplementation(async () =>
				[...outputFiles.entries()].map(([filePath, bytes]) => ({
					path: filePath,
					type: "file",
					size: bytes.byteLength,
				})),
			),
			readBytes: vi.fn().mockImplementation(async (filePath) => {
				const bytes = outputFiles.get(filePath);
				if (!bytes) throw new Error(`Missing fake file: ${filePath}`);
				return bytes;
			}),
		},
		commands: {
			run: vi.fn().mockResolvedValue({
				logs: {
					stdout: [{ text: options.stdout ?? "" }],
					stderr: [{ text: options.stderr ?? "" }],
				},
				result: [],
				exitCode: options.exitCode ?? 0,
				complete: { executionTimeMs: 12, timestamp: Date.now() },
			}),
		},
		kill: vi.fn().mockResolvedValue(undefined),
		close: vi.fn().mockResolvedValue(undefined),
		writtenFiles,
	};
	return sandbox;
}

async function loadSandboxModule() {
	vi.resetModules();
	return import("@/modules/tool/code-sandbox");
}

describe("OpenSandbox code sandbox", () => {
	beforeEach(() => {
		opensandboxMock.create.mockReset();
		opensandboxMock.connectionConfig.mockClear();
		process.env.OPENSANDBOX_DOMAIN = "opensandbox-server:8090";
		process.env.OPENSANDBOX_PROTOCOL = "http";
		process.env.OPENSANDBOX_API_KEY = "test-opensandbox-key";
		process.env.OPENSANDBOX_IMAGE = "opensandbox/code-interpreter:v1.1.0";
		process.env.OPENSANDBOX_USE_SERVER_PROXY = "false";
	});

	it("runs Node.js code through OpenSandbox and returns generated files", async () => {
		const sandbox = fakeSandbox({
			stdout: "1,4,9\n",
			files: [
				{
					path: "/workspace/result.txt",
					content: "squares=1,4,9",
				},
			],
		});
		opensandboxMock.create.mockResolvedValue(sandbox);
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
		expect(opensandboxMock.connectionConfig).toHaveBeenCalledWith(
			expect.objectContaining({
				domain: "opensandbox-server:8090",
				useServerProxy: false,
			}),
		);
		expect(opensandboxMock.create).toHaveBeenCalledWith(
			expect.objectContaining({
				image: "opensandbox/code-interpreter:v1.1.0",
				metadata: expect.objectContaining({ language: "node" }),
			}),
		);
		expect(sandbox.writtenFiles.has("/workspace/main.mjs")).toBe(true);
		expect(
			sandbox.writtenFiles.get("/workspace/data/input.txt")?.toString(),
		).toBe("hello");
		expect(sandbox.commands.run).toHaveBeenCalledWith(
			"node --no-warnings main.mjs",
			expect.objectContaining({ workingDirectory: "/workspace" }),
		);
		expect(sandbox.kill).toHaveBeenCalled();
		expect(sandbox.close).toHaveBeenCalled();
	});

	it("rejects unsafe input file paths before creating a sandbox", async () => {
		const { executeCodeSandbox } = await loadSandboxModule();

		const result = await (executeCodeSandbox as ExecuteCodeSandbox)({
			language: "node",
			code: "console.log('nope')",
			files: [{ path: "../outside.txt", content: "secret" }],
		});

		expect(result.ok).toBe(false);
		expect(result.error).toMatch(/Path traversal/i);
		expect(opensandboxMock.create).not.toHaveBeenCalled();
	});

	it("returns an actionable error when OpenSandbox is unavailable", async () => {
		opensandboxMock.create.mockRejectedValue(new Error("connect ECONNREFUSED"));
		const { executeCodeSandbox } = await loadSandboxModule();

		const result = await (executeCodeSandbox as ExecuteCodeSandbox)({
			language: "bash",
			code: "echo ok",
		});

		expect(result.ok).toBe(false);
		expect(result.stderr).toContain("OpenSandbox unavailable");
		expect(result.stderr).toContain(
			"docker compose -f docker-compose.dev.yml up -d opensandbox-server",
		);
	});
});
