import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const storageMock = vi.hoisted(() => {
	const objects = new Map<
		string,
		{ bytes: Uint8Array; contentType?: string }
	>();
	return {
		objects,
		upload: vi.fn(
			async (key: string, value: Uint8Array | string, contentType?: string) => {
				objects.set(key, {
					bytes:
						typeof value === "string"
							? new TextEncoder().encode(value)
							: new Uint8Array(value),
					contentType,
				});
			},
		),
		download: vi.fn(async (key: string) => {
			const object = objects.get(key);
			if (!object) throw new Error(`missing ${key}`);
			return object.bytes;
		}),
		delete: vi.fn(async (key: string) => {
			objects.delete(key);
		}),
	};
});

vi.mock("@/server/infrastructure/storage", () => ({ storage: storageMock }));
vi.mock("@/lib/logger", () => ({ logHandledError: vi.fn() }));

const oldEnv = process.env.CODE_WORKSPACE_DIR;

beforeEach(() => {
	vi.resetModules();
	storageMock.objects.clear();
	vi.clearAllMocks();
});

afterEach(() => {
	if (oldEnv === undefined) delete process.env.CODE_WORKSPACE_DIR;
	else process.env.CODE_WORKSPACE_DIR = oldEnv;
});

describe("legacy code workspace migration", () => {
	it("migrates legacy filesystem projects into object storage on first read", async () => {
		const legacyRoot = await mkdtemp(path.join(os.tmpdir(), "legacy-cw-"));
		process.env.CODE_WORKSPACE_DIR = legacyRoot;
		const projectId = "123e4567-e89b-42d3-a456-426614174000";
		const projectDir = path.join(legacyRoot, projectId);
		const filesDir = path.join(projectDir, "files");
		await mkdir(path.join(filesDir, "assets"), { recursive: true });
		await writeFile(path.join(filesDir, "index.html"), "<h1>Legacy</h1>");
		await writeFile(
			path.join(filesDir, "assets", "app.js"),
			"console.log('legacy')",
		);
		await writeFile(
			path.join(projectDir, "metadata.json"),
			JSON.stringify({
				id: projectId,
				workspaceId: "ws-1",
				createdByUserId: "user-1",
				title: "Legacy App",
				rootFile: "index.html",
				version: 1,
				previewToken: "preview-token",
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:00:00.000Z",
				files: [
					{
						path: "index.html",
						size: 15,
						mimeType: "text/html; charset=utf-8",
						binary: false,
						hash: "h1",
						updatedAt: "2024-01-01T00:00:00.000Z",
					},
					{
						path: "assets/app.js",
						size: 21,
						mimeType: "text/javascript; charset=utf-8",
						binary: false,
						hash: "h2",
						updatedAt: "2024-01-01T00:00:00.000Z",
					},
				],
			}),
		);

		const storage = await import("@/modules/code-workspace/storage");
		await expect(
			storage.listCodeWorkspaceFiles({
				projectId,
				workspaceId: "ws-1",
				userId: "user-1",
			}),
		).resolves.toMatchObject({
			title: "Legacy App",
			rootFile: "index.html",
			files: [
				expect.objectContaining({ path: "assets/app.js" }),
				expect.objectContaining({ path: "index.html" }),
			],
		});
		expect(storageMock.upload).toHaveBeenCalledWith(
			`code-workspaces/${projectId}/files/index.html`,
			expect.any(Uint8Array),
			"text/html; charset=utf-8",
		);
		await expect(stat(projectDir)).rejects.toThrow();
		await expect(
			storage.readCodeWorkspaceFile({
				projectId,
				workspaceId: "ws-1",
				userId: "user-1",
				filePath: "assets/app.js",
			}),
		).resolves.toMatchObject({
			content: "console.log('legacy')",
		});
	});

	it("falls back to not found when object storage and legacy metadata are missing or invalid", async () => {
		const legacyRoot = await mkdtemp(path.join(os.tmpdir(), "legacy-cw-"));
		process.env.CODE_WORKSPACE_DIR = legacyRoot;
		const projectId = "123e4567-e89b-42d3-a456-426614174001";
		await mkdir(path.join(legacyRoot, projectId), { recursive: true });
		await writeFile(
			path.join(legacyRoot, projectId, "metadata.json"),
			"not json",
		);
		const storage = await import("@/modules/code-workspace/storage");
		await expect(storage.getCodeWorkspace(projectId)).rejects.toThrow(
			"Code workspace not found",
		);
		await expect(storage.getCodeWorkspace("bad-id")).rejects.toThrow(
			"Invalid code workspace id",
		);
	});
});
