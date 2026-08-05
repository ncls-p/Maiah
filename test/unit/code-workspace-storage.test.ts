import JSZip from "jszip";
import { beforeEach,describe,expect,it,vi } from "vitest";

const storageMock = vi.hoisted(() => {
	const objects = new Map<
		string,
		{ bytes: Uint8Array; contentType?: string }
	>();
	return {
		objects,
		upload: vi.fn(
			async (
				key: string,
				bytes: Uint8Array | Buffer | string,
				contentType?: string,
			) => {
				objects.set(key, {
					bytes:
						typeof bytes === "string"
							? new TextEncoder().encode(bytes)
							: new Uint8Array(bytes),
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

vi.mock("@/server/infrastructure/storage", () => ({
	storage: storageMock,
}));

vi.mock("@/lib/logger", () => ({
	logHandledError: vi.fn(),
}));

import {
createCodeWorkspaceFromFiles,
createCodeWorkspaceFromZip,
getCodeWorkspace,
isTextWorkspacePath,
normalizeWorkspacePath
} from "@/modules/code-workspace/storage";

const workspaceId = "ws-1";
const userId = "user-1";

beforeEach(() => {
	vi.clearAllMocks();
	storageMock.objects.clear();
});

describe("code workspace storage", () => {
	it("normalizes paths and classifies text extensions", () => {
		expect(normalizeWorkspacePath(" ./src\\index.html ")).toBe(
			"src/index.html",
		);
		expect(isTextWorkspacePath("index.html")).toBe(true);
		expect(isTextWorkspacePath("image.png")).toBe(false);
		expect(() => normalizeWorkspacePath("/abs/path")).toThrow("Absolute paths");
		expect(() => normalizeWorkspacePath("../secret.txt")).toThrow(
			"Path traversal",
		);
		expect(() => normalizeWorkspacePath("a/".repeat(20) + "x.txt")).toThrow(
			"too deep",
		);
	});

	it("creates workspaces from files, saves metadata, and reports sorted artifact files", async () => {
		const artifact = await createCodeWorkspaceFromFiles({
			workspaceId,
			userId,
			title: "  Demo App  ",
			rootFile: "index.html",
			files: [
				{ path: "src/app.js", content: "console.log('ok')" },
				{ path: "index.html", content: "<script src='src/app.js'></script>" },
			],
		});

		expect(artifact.kind).toBe("code_workspace_artifact");
		expect(artifact.title).toBe("Demo App");
		expect(artifact.rootFile).toBe("index.html");
		expect(artifact.previewUrl).toContain("/preview/");
		expect(artifact.files.map((file) => file.path)).toEqual([
			"index.html",
			"src/app.js",
		]);
		expect(storageMock.upload).toHaveBeenCalledWith(
			expect.stringContaining("files/index.html"),
			expect.any(Uint8Array),
			"text/html; charset=utf-8",
		);
		expect(await getCodeWorkspace(artifact.projectId)).toMatchObject({
			id: artifact.projectId,
			version: 1,
		});
	});

	it("rejects invalid create-from-files inputs and cleans up uploaded files", async () => {
		await expect(
			createCodeWorkspaceFromFiles({
				workspaceId,
				userId,
				title: "x",
				files: [],
			}),
		).rejects.toThrow("Create at least one file");
		await expect(
			createCodeWorkspaceFromFiles({
				workspaceId,
				userId,
				title: "x",
				files: [
					{ path: "a.txt", content: "a" },
					{ path: "./a.txt", content: "b" },
				],
			}),
		).rejects.toThrow("Duplicate file path");
		await expect(
			createCodeWorkspaceFromFiles({
				workspaceId,
				userId,
				title: "x",
				rootFile: "style.css",
				files: [{ path: "style.css", content: "body{}" }],
			}),
		).rejects.toThrow("rootFile must be an HTML file");
	});

	it("creates workspaces from ZIPs, ignores junk entries, supports binary files, and rejects unsafe archives", async () => {
		const zip = new JSZip();
		zip.file("index.html", "<h1>Hello</h1>");
		zip.file("assets/logo.png", new Uint8Array([1, 2, 3]));
		zip.file("assets/theme.mp3", new Uint8Array([73, 68, 51, 4]));
		zip.file("assets/effect.wav", new Uint8Array([82, 73, 70, 70]));
		zip.file("assets/demo.mp4", new Uint8Array([0, 0, 0, 24]));
		zip.file("assets/stream.m3u8", "#EXTM3U\n");
		zip.file("__MACOSX/ignored.txt", "ignored");
		zip.file(".DS_Store", "ignored");
		const metadata = await createCodeWorkspaceFromZip({
			workspaceId,
			userId,
			fileName: "demo.zip",
			buffer: await zip.generateAsync({ type: "uint8array" }),
		});

		expect(metadata.title).toBe("demo");
		expect(metadata.rootFile).toBe("index.html");
		expect(metadata.files).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: "assets/logo.png",
					binary: true,
					mimeType: "image/png",
				}),
				expect.objectContaining({
					path: "assets/theme.mp3",
					binary: true,
					mimeType: "audio/mpeg",
				}),
				expect.objectContaining({
					path: "assets/effect.wav",
					binary: true,
					mimeType: "audio/wav",
				}),
				expect.objectContaining({
					path: "assets/demo.mp4",
					binary: true,
					mimeType: "video/mp4",
				}),
				expect.objectContaining({
					path: "assets/stream.m3u8",
					binary: false,
					mimeType: "application/vnd.apple.mpegurl; charset=utf-8",
				}),
				expect.objectContaining({ path: "index.html", binary: false }),
			]),
		);

		const unsafe = new JSZip();
		unsafe.file("server.exe", "bad");
		await expect(
			createCodeWorkspaceFromZip({
				workspaceId,
				userId,
				fileName: "bad.zip",
				buffer: await unsafe.generateAsync({ type: "uint8array" }),
			}),
		).rejects.toThrow("Unsupported file type in ZIP");
	});
});
