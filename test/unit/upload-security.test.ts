import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

const objectStore = new Map<string, Uint8Array>();

vi.mock("@/server/infrastructure/storage", () => ({
	storage: {
		upload: vi.fn(async (key: string, body: Buffer | Uint8Array | string) => {
			const bytes =
				typeof body === "string"
					? new TextEncoder().encode(body)
					: new Uint8Array(body);
			objectStore.set(key, bytes);
			return key;
		}),
		download: vi.fn(async (key: string) => {
			const bytes = objectStore.get(key);
			if (!bytes) throw new Error("No such key");
			return bytes;
		}),
		delete: vi.fn(async (key: string) => {
			objectStore.delete(key);
		}),
	},
}));

async function zipBytes(files: Record<string, string | Uint8Array>) {
	const zip = new JSZip();
	for (const [filePath, content] of Object.entries(files)) {
		zip.file(filePath, content);
	}
	return zip.generateAsync({ type: "uint8array" });
}

beforeEach(() => {
	objectStore.clear();
});

describe("upload security", () => {
	it("rejects unsafe workspace paths", async () => {
		const { normalizeWorkspacePath } = await import(
			"@/modules/code-workspace/storage"
		);

		expect(() => normalizeWorkspacePath("../index.html")).toThrow(
			/Path traversal/,
		);
		expect(() => normalizeWorkspacePath("/index.html")).toThrow(/Absolute/);
		expect(() => normalizeWorkspacePath("C:/index.html")).toThrow(/Absolute/);
		expect(normalizeWorkspacePath("./src/../index.html")).toBe("index.html");
	});

	it("rejects ZIP entries that JSZip sanitized from unsafe names", async () => {
		const { createCodeWorkspaceFromZip } = await import(
			"@/modules/code-workspace/storage"
		);

		await expect(
			createCodeWorkspaceFromZip({
				workspaceId: "11111111-1111-4111-8111-111111111111",
				userId: "user-1",
				fileName: "evil.zip",
				buffer: await zipBytes({ "../index.html": "<h1>oops</h1>" }),
			}),
		).rejects.toThrow(/Unsafe ZIP path/);
	});

	it("creates a workspace from direct HTML/CSS/JS files", async () => {
		const { createCodeWorkspaceFromFiles, readCodeWorkspaceFile } =
			await import("@/modules/code-workspace/storage");

		const artifact = await createCodeWorkspaceFromFiles({
			workspaceId: "11111111-1111-4111-8111-111111111111",
			userId: "user-1",
			title: "Direct upload",
			files: [
				{ path: "index.html", content: "<h1>Hello</h1>" },
				{ path: "style.css", content: "h1 { color: red; }" },
				{ path: "script.js", content: "console.log('hello');" },
			],
		});

		expect(artifact.rootFile).toBe("index.html");
		expect(artifact.files.map((file) => file.path)).toEqual([
			"index.html",
			"script.js",
			"style.css",
		]);
		await expect(
			readCodeWorkspaceFile({
				projectId: artifact.projectId,
				workspaceId: "11111111-1111-4111-8111-111111111111",
				userId: "user-1",
				filePath: "script.js",
			}),
		).resolves.toMatchObject({ content: "console.log('hello');" });
	});

	it("scopes code workspace file access to the creating user", async () => {
		const { createCodeWorkspaceFromZip, readCodeWorkspaceFile } = await import(
			"@/modules/code-workspace/storage"
		);

		const metadata = await createCodeWorkspaceFromZip({
			workspaceId: "11111111-1111-4111-8111-111111111111",
			userId: "user-1",
			fileName: "site.zip",
			buffer: await zipBytes({ "index.html": "<h1>Hello</h1>" }),
		});

		await expect(
			readCodeWorkspaceFile({
				projectId: metadata.id,
				workspaceId: metadata.workspaceId,
				userId: "user-2",
				filePath: "index.html",
			}),
		).rejects.toThrow(/not found/i);

		await expect(
			readCodeWorkspaceFile({
				projectId: metadata.id,
				workspaceId: metadata.workspaceId,
				userId: "user-1",
				filePath: "index.html",
			}),
		).resolves.toMatchObject({ content: "<h1>Hello</h1>" });
	});

	it("rejects chat image uploads whose bytes do not match an allowed image type", async () => {
		const { createChatImageAttachment } = await import(
			"@/modules/chat/attachments"
		);

		await expect(
			createChatImageAttachment({
				workspaceId: "11111111-1111-4111-8111-111111111111",
				userId: "user-1",
				fileName: "not-really.png",
				bytes: new TextEncoder().encode("<script>alert(1)</script>"),
			}),
		).rejects.toThrow(/Unsupported image type/);
	});
});
