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
		text: "extracted text",
	})),
	isChatFileAttachment: vi.fn(
		(value: { kind?: string }) => value.kind === "chat_file",
	),
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
				exitCode: options.exitCode === undefined ? 0 : options.exitCode,
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
			expect.stringContaining("node --no-warnings main.mjs"),
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

	it("runs Python with stdin, base64 files, attachment text, and persisted outputs", async () => {
		const sandbox = fakeSandbox({
			stdout: "py ok\n",
			files: [
				{ path: "/workspace/report.txt", content: "generated report" },
				{ path: "/workspace/data.bin", content: Buffer.from("bin") },
				{ path: "/workspace/home/ignored.txt", content: "ignore" },
			],
		});
		opensandboxMock.create.mockResolvedValue(sandbox);
		const { executeCodeSandbox } = await loadSandboxModule();

		const result = await (executeCodeSandbox as ExecuteCodeSandbox)(
			{
				language: "python",
				code: "print(input())",
				stdin: "hello stdin",
				files: [
					{
						path: "data.bin",
						contentBase64: Buffer.from("bin").toString("base64"),
					},
				],
				attachments: [{ id: "source-att", includeExtractedText: true }],
				timeoutMs: 999_999,
			},
			{ workspaceId: "ws-1", userId: "user-1" },
		);

		expect(result.ok).toBe(true);
		expect(result.language).toBe("python");
		expect(result.files).toContainEqual(
			expect.objectContaining({
				path: "report.txt",
				textPreview: "generated report",
				downloadUrl: "/attachments/report.txt",
			}),
		);
		expect(result.files).toContainEqual(
			expect.objectContaining({
				path: "data.bin",
				fromInput: true,
				modified: false,
			}),
		);
		expect(sandbox.writtenFiles.get("/workspace/.stdin")?.toString()).toBe(
			"hello stdin",
		);
		expect(
			sandbox.writtenFiles
				.get("/workspace/attachments/Source File.txt")
				?.toString(),
		).toBe("input");
		expect(
			sandbox.writtenFiles
				.get("/workspace/attachments/Source File.extracted.txt")
				?.toString(),
		).toBe("extracted text");
		expect(sandbox.commands.run).toHaveBeenCalledWith(
			expect.stringContaining("python3 -I main.py < .stdin"),
			expect.objectContaining({ timeoutSeconds: 120 }),
		);
	});

	it("reports execution errors, timeouts, binary previews, and oversized collected files", async () => {
		const sandbox = fakeSandbox({
			exitCode: null,
			stderr: "execution timed out",
			files: [
				{ path: "/workspace/big.txt", content: Buffer.alloc(1_000_001, "a") },
				{ path: "/workspace/image.bin", content: Buffer.from([0, 1, 2, 3]) },
			],
		});
		opensandboxMock.create.mockResolvedValue(sandbox);
		const { executeCodeSandbox } = await loadSandboxModule();

		const result = await (executeCodeSandbox as ExecuteCodeSandbox)({
			language: "bash",
			code: "sleep 999",
			timeoutMs: 10,
		});

		expect(result.ok).toBe(false);
		expect(result.timedOut).toBe(true);
		expect(result.exitCode).toBeNull();
		expect(result.files).toContainEqual(
			expect.objectContaining({ path: "big.txt", skipped: "too_large" }),
		);
		expect(result.files).toContainEqual(
			expect.objectContaining({
				path: "image.bin",
				mimeType: "application/octet-stream",
			}),
		);
		expect(sandbox.commands.run).toHaveBeenCalledWith(
			expect.stringContaining(
				"bash --noprofile --norc -e -u -o pipefail main.sh",
			),
			expect.any(Object),
		);
	});

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
		expect(opensandboxMock.create).not.toHaveBeenCalled();
	});
});
