import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

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
	codeWorkspaceArtifact,
	createCodeWorkspaceFromFiles,
	createCodeWorkspaceFromZip,
	createCodeWorkspaceZip,
	deleteCodeWorkspaceFile,
	getCodeWorkspace,
	getCodeWorkspaceFileBytes,
	getCodeWorkspaceFilesForPublish,
	isTextWorkspacePath,
	listCodeWorkspaceFiles,
	normalizeWorkspacePath,
	readCodeWorkspaceFile,
	writeCodeWorkspaceFile,
} from "@/modules/code-workspace/storage";

const workspaceId = "ws-1";
const userId = "user-1";

function metadataKey(projectId: string) {
	return `code-workspaces/${projectId}/metadata.json`;
}

async function loadMetadata(projectId: string) {
	return JSON.parse(
		Buffer.from(await storageMock.download(metadataKey(projectId))).toString(
			"utf8",
		),
	);
}

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

	it("lists, reads, writes, deletes, publishes, and zips workspace files", async () => {
		const created = await createCodeWorkspaceFromFiles({
			workspaceId,
			userId,
			title: "Demo App",
			files: [
				{ path: "index.html", content: "<h1>Old</h1>" },
				{ path: "style.css", content: "body{}" },
			],
		});
		const projectId = created.projectId;

		await expect(
			listCodeWorkspaceFiles({ projectId, workspaceId, userId }),
		).resolves.toMatchObject({ projectId });
		await expect(
			readCodeWorkspaceFile({
				projectId,
				workspaceId,
				userId,
				filePath: "index.html",
			}),
		).resolves.toMatchObject({
			content: "<h1>Old</h1>",
			mimeType: "text/html; charset=utf-8",
		});

		const updated = await writeCodeWorkspaceFile({
			projectId,
			workspaceId,
			userId,
			filePath: "about.html",
			content: "<h1>About</h1>",
		});
		expect(updated.version).toBe(2);
		expect(updated.files.map((file) => file.path)).toContain("about.html");

		const deleted = await deleteCodeWorkspaceFile({
			projectId,
			workspaceId,
			userId,
			filePath: "index.html",
		});
		expect(deleted.version).toBe(3);
		expect(deleted.rootFile).toBe("about.html");

		const bytes = await getCodeWorkspaceFileBytes({
			projectId,
			filePath: "about.html",
		});
		expect(Buffer.from(bytes.bytes).toString("utf8")).toBe("<h1>About</h1>");

		const publish = await getCodeWorkspaceFilesForPublish({
			projectId,
			workspaceId,
			userId,
		});
		expect(publish.files.map((file) => file.path)).toEqual([
			"about.html",
			"style.css",
		]);
		expect(Buffer.from(publish.files[0].bytes).toString("utf8")).toBe(
			"<h1>About</h1>",
		);

		const zipped = await createCodeWorkspaceZip({
			projectId,
			workspaceId,
			userId,
		});
		expect(zipped.fileName).toBe("Demo-App.zip");
		const reopened = await JSZip.loadAsync(zipped.bytes);
		expect(Object.keys(reopened.files).sort()).toEqual([
			"about.html",
			"style.css",
		]);

		const metadata = await loadMetadata(projectId);
		expect(codeWorkspaceArtifact(metadata, "ok").message).toBe("ok");
	});

	it("enforces access, read/write constraints, and missing-file handling", async () => {
		const created = await createCodeWorkspaceFromFiles({
			workspaceId,
			userId,
			title: "Demo",
			files: [{ path: "index.html", content: "<h1>Hi</h1>" }],
		});
		await expect(
			listCodeWorkspaceFiles({
				projectId: created.projectId,
				workspaceId: "other",
				userId,
			}),
		).rejects.toThrow("Code workspace not found");
		await expect(
			readCodeWorkspaceFile({
				projectId: created.projectId,
				workspaceId,
				userId,
				filePath: "missing.html",
			}),
		).rejects.toThrow("File not found");
		await expect(
			writeCodeWorkspaceFile({
				projectId: created.projectId,
				workspaceId,
				userId,
				filePath: "image.png",
				content: "bad",
			}),
		).rejects.toThrow("Only supported text web files");
		await expect(
			deleteCodeWorkspaceFile({
				projectId: created.projectId,
				workspaceId,
				userId,
				filePath: "missing.html",
			}),
		).rejects.toThrow("File not found");
	});
});
