import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => ({
	upload: vi.fn(),
	download: vi.fn(),
	delete: vi.fn(),
}));

vi.mock("@/server/infrastructure/storage", () => ({ storage: storageMock }));

import {
	documentUploadChunkBytes,
	documentUploadChunkCount,
	uploadDocumentInChunks,
} from "@/modules/document-upload/chunked-upload";
import {
	assembleDocumentUpload,
	parseChunkMetadata,
	parseCompletionMetadata,
	storeDocumentUploadChunk,
} from "@/modules/document-upload/server";

describe("chunked document upload", () => {
	beforeEach(() => {
		storageMock.upload.mockReset().mockResolvedValue("key");
		storageMock.download.mockReset();
		storageMock.delete.mockReset().mockResolvedValue(undefined);
	});

	afterEach(() => vi.unstubAllGlobals());

	it("splits a document, reports progress, and completes without a file-size cap", async () => {
		const bytes = new Uint8Array(documentUploadChunkBytes + 3).fill(65);
		const file = new File([bytes], "large.pdf", { type: "application/pdf" });
		const progress: number[] = [];
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response("{}", { status: 202 }))
			.mockResolvedValueOnce(new Response("{}", { status: 202 }))
			.mockResolvedValueOnce(
				Response.json({ attachment: { id: "attachment" } }),
			);
		vi.stubGlobal("fetch", fetchMock);

		const result = await uploadDocumentInChunks<{ attachment: { id: string } }>({
			file,
			workspaceId: "workspace",
			chunkUrl: "/chunks",
			completeUrl: "/complete",
			onProgress: (value) => progress.push(value),
		});

		expect(documentUploadChunkCount(file.size)).toBe(2);
		expect(result.attachment.id).toBe("attachment");
		expect(progress).toEqual([45, 90, 100]);
		expect(fetchMock).toHaveBeenCalledTimes(3);
		const firstForm = fetchMock.mock.calls[0]?.[1]?.body as FormData;
		expect((firstForm.get("chunk") as File).size).toBe(
			documentUploadChunkBytes,
		);
		const completion = JSON.parse(
			String(fetchMock.mock.calls[2]?.[1]?.body),
		) as Record<string, unknown>;
		expect(completion).toMatchObject({
			totalChunks: 2,
			fileName: "large.pdf",
			mimeType: "application/pdf",
		});
	});

	it("retries an interrupted chunk and exposes server errors", async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce(new Response("{}", { status: 202 }))
			.mockResolvedValueOnce(
				Response.json({ error: "Extraction failed" }, { status: 400 }),
			);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			uploadDocumentInChunks({
				file: new File(["hello"], "notes.txt"),
				workspaceId: "workspace",
				chunkUrl: "/chunks",
				completeUrl: "/complete",
			}),
		).rejects.toThrow("Extraction failed");
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("rejects empty documents and repeated chunk failures", async () => {
		await expect(
			uploadDocumentInChunks({
				file: new File([], "empty.txt"),
				workspaceId: "workspace",
				chunkUrl: "/chunks",
				completeUrl: "/complete",
			}),
		).rejects.toThrow("empty");

		vi.stubGlobal(
			"fetch",
			vi
				.fn<typeof fetch>()
				.mockImplementation(async () =>
					Response.json({ error: "Chunk refused" }, { status: 500 }),
				),
		);
		await expect(
			uploadDocumentInChunks({
				file: new File(["x"], "x.txt"),
				workspaceId: "workspace",
				chunkUrl: "/chunks",
				completeUrl: "/complete",
			}),
		).rejects.toThrow("Chunk refused");

		vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue("offline"));
		await expect(
			uploadDocumentInChunks({
				file: new File(["x"], "x.txt"),
				workspaceId: "workspace",
				chunkUrl: "/chunks",
				completeUrl: "/complete",
			}),
		).rejects.toThrow("Document chunk upload failed");
	});

	it("validates, stores, assembles, and cleans persistent chunks", async () => {
		const uploadId = "123e4567-e89b-42d3-a456-426614174000";
		const form = new FormData();
		form.set("workspaceId", "workspace");
		form.set("uploadId", uploadId);
		form.set("chunkIndex", "0");
		form.set("totalChunks", "2");
		form.set("chunk", new File(["hello "], "part"));
		const parsed = parseChunkMetadata(form);
		expect(parsed).toMatchObject({ chunkIndex: 0, totalChunks: 2 });

		await storeDocumentUploadChunk({
			workspaceId: "workspace",
			userId: "user",
			uploadId,
			chunkIndex: 0,
			bytes: new TextEncoder().encode("hello "),
		});
		expect(storageMock.upload).toHaveBeenCalledWith(
			expect.stringContaining(`${uploadId}/parts/0000000000.part`),
			expect.any(Uint8Array),
			"application/octet-stream",
		);

		storageMock.download
			.mockResolvedValueOnce(new TextEncoder().encode("hello "))
			.mockResolvedValueOnce(new TextEncoder().encode("world"));
		const assembled = await assembleDocumentUpload({
			workspaceId: "workspace",
			userId: "user",
			uploadId,
			totalChunks: 2,
		});
		expect(Buffer.from(await assembled.readBytes()).toString()).toBe(
			"hello world",
		);
		expect(Buffer.from(await readFile(assembled.filePath)).toString()).toBe(
			"hello world",
		);
		await assembled.cleanup(true);
		expect(storageMock.delete).toHaveBeenCalledTimes(2);
	});

	it("keeps persistent chunks when cleanup is requested after a failure", async () => {
		storageMock.download.mockResolvedValue(new Uint8Array([1]));
		const assembled = await assembleDocumentUpload({
			workspaceId: "workspace",
			userId: "user",
			uploadId: "123e4567-e89b-42d3-a456-426614174000",
			totalChunks: 1,
		});
		await assembled.cleanup(false);
		expect(storageMock.delete).not.toHaveBeenCalled();
	});

	it("removes its temporary directory when chunk assembly fails", async () => {
		storageMock.download.mockRejectedValue(new Error("missing chunk"));
		await expect(
			assembleDocumentUpload({
				workspaceId: "workspace",
				userId: "user",
				uploadId: "123e4567-e89b-42d3-a456-426614174000",
				totalChunks: 1,
			}),
		).rejects.toThrow("missing chunk");
	});

	it("rejects malformed chunk and completion metadata", () => {
		expect(parseChunkMetadata(new FormData())).toBeNull();
		expect(parseCompletionMetadata(null)).toBeNull();
		expect(parseCompletionMetadata({ uploadId: "bad" })).toBeNull();
		expect(
			parseCompletionMetadata({
				workspaceId: "workspace",
				uploadId: "123e4567-e89b-42d3-a456-426614174000",
				totalChunks: 2,
				fileName: "manual.docx",
				mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			}),
		).toMatchObject({ fileName: "manual.docx", totalChunks: 2 });
	});
});
