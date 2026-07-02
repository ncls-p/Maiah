import { beforeEach, describe, expect, it, vi } from "vitest";
import { deflateSync } from "node:zlib";
import JSZip from "jszip";

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

import {
	createChatAttachment,
	createChatImageAttachment,
	getChatAttachment,
	getChatAttachmentBytes,
	getChatAttachmentExtractedText,
	getChatImageAttachmentBytes,
	isChatFileAttachment,
	isChatImageAttachment,
	publicChatAttachment,
} from "@/modules/chat/attachments";

const workspaceId = "ws-1";
const userId = "user-1";

function pngBytes() {
	return new Uint8Array([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
	]);
}

async function docxBytes() {
	const zip = new JSZip();
	zip.file(
		"word/document.xml",
		"<w:document><w:t>Hello &amp; welcome</w:t></w:document>",
	);
	zip.file("word/header1.xml", "<w:t>Header</w:t>");
	return zip.generateAsync({ type: "uint8array" });
}

async function officeBytes(kind: "pptx" | "xlsx") {
	const zip = new JSZip();
	if (kind === "pptx")
		zip.file("ppt/slides/slide2.xml", "<a:t>Slide &lt;Two&gt;</a:t>");
	else zip.file("xl/sharedStrings.xml", "<t>Cell &amp; value</t>");
	return zip.generateAsync({ type: "uint8array" });
}

beforeEach(() => {
	vi.clearAllMocks();
	storageMock.objects.clear();
});

describe("chat attachments", () => {
	it("creates image attachments, exposes public metadata, and enforces image retrieval", async () => {
		const image = await createChatImageAttachment({
			workspaceId,
			userId,
			fileName: " ../My Image.png ",
			bytes: pngBytes(),
		});

		expect(isChatImageAttachment(image)).toBe(true);
		expect(image.fileName).toBe("My-Image.png");
		expect(image.mimeType).toBe("image/png");
		const metadata = await getChatAttachment(image.id);
		expect(publicChatAttachment(metadata)).toEqual(image);
		await expect(
			getChatImageAttachmentBytes({
				attachmentId: image.id,
				workspaceId,
				userId,
			}),
		).resolves.toMatchObject({
			metadata: expect.objectContaining({ kind: "chat_image" }),
		});
		await expect(
			createChatImageAttachment({
				workspaceId,
				userId,
				fileName: "bad.txt",
				bytes: new TextEncoder().encode("not image"),
			}),
		).rejects.toThrow("Unsupported image type");
	});

	it("creates readable text, RTF, PDF, and DOCX file attachments with extracted text", async () => {
		const text = await createChatAttachment({
			workspaceId,
			userId,
			fileName: "notes.md",
			mimeType: "text/markdown",
			bytes: new TextEncoder().encode("# Notes\n\nHello"),
		});
		expect(isChatFileAttachment(text)).toBe(true);
		expect(text).toMatchObject({
			kind: "chat_file",
			category: "text",
			extractionStatus: "readable",
		});
		await expect(
			getChatAttachmentExtractedText({
				attachmentId: text.id,
				workspaceId,
				userId,
			}),
		).resolves.toMatchObject({ text: "# Notes\n\nHello" });

		const rtf = await createChatAttachment({
			workspaceId,
			userId,
			fileName: "doc.rtf",
			mimeType: "text/rtf",
			bytes: new TextEncoder().encode("{\\rtf1 Hello \\b bold}"),
		});
		expect(isChatFileAttachment(rtf)).toBe(true);
		expect(
			(rtf as Extract<typeof rtf, { kind: "chat_file" }>).extractedTextChars,
		).toBeGreaterThan(0);

		const pdf = await createChatAttachment({
			workspaceId,
			userId,
			fileName: "file.pdf",
			bytes: new TextEncoder().encode(
				"%PDF-1.4\nBT (Hello PDF) Tj <00480069> Tj ET",
			),
		});
		expect(pdf).toMatchObject({
			category: "document",
			extractionStatus: "readable",
		});
		await expect(
			getChatAttachmentExtractedText({
				attachmentId: pdf.id,
				workspaceId,
				userId,
			}),
		).resolves.toMatchObject({
			text: expect.stringContaining("Hello PDF"),
		});

		const docx = await createChatAttachment({
			workspaceId,
			userId,
			fileName: "word.docx",
			mimeType:
				"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			bytes: await docxBytes(),
		});
		expect(docx).toMatchObject({
			category: "document",
			extractionStatus: "readable",
		});
		await expect(
			getChatAttachmentExtractedText({
				attachmentId: docx.id,
				workspaceId,
				userId,
			}),
		).resolves.toMatchObject({
			text: expect.stringContaining("Hello & welcome"),
		});
	});

	it("extracts additional formats and truncates large text safely", async () => {
		const pptx = await createChatAttachment({
			workspaceId,
			userId,
			fileName: "slides.pptx",
			mimeType:
				"application/vnd.openxmlformats-officedocument.presentationml.presentation",
			bytes: await officeBytes("pptx"),
		});
		expect(pptx).toMatchObject({
			category: "presentation",
			extractionStatus: "readable",
		});
		await expect(
			getChatAttachmentExtractedText({
				attachmentId: pptx.id,
				workspaceId,
				userId,
			}),
		).resolves.toMatchObject({ text: expect.stringContaining("Slide 2") });

		const xlsx = await createChatAttachment({
			workspaceId,
			userId,
			fileName: "sheet.xlsx",
			mimeType:
				"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			bytes: await officeBytes("xlsx"),
		});
		expect(xlsx).toMatchObject({
			category: "spreadsheet",
			extractionStatus: "readable",
		});

		const large = await createChatAttachment({
			workspaceId,
			userId,
			fileName: "large.txt",
			bytes: new TextEncoder().encode("a".repeat(130_000)),
		});
		expect(large).toMatchObject({
			extractionStatus: "truncated",
			extractionMessage: expect.stringContaining("first"),
		});

		const compressedStream = deflateSync(
			Buffer.from("BT (Compressed PDF) Tj ET", "latin1"),
		).toString("latin1");
		const compressedPdf = await createChatAttachment({
			workspaceId,
			userId,
			fileName: "compressed.pdf",
			bytes: Buffer.from(
				`%PDF-1.4\n<< /Filter /FlateDecode >>\nstream\n${compressedStream}\nendstream`,
				"latin1",
			),
		});
		await expect(
			getChatAttachmentExtractedText({
				attachmentId: compressedPdf.id,
				workspaceId,
				userId,
			}),
		).resolves.toMatchObject({
			text: expect.stringContaining("Compressed PDF"),
		});
	});

	it("handles unreadable files, access checks, invalid metadata, and cleanup on failed upload", async () => {
		await expect(
			createChatAttachment({
				workspaceId,
				userId,
				fileName: "empty.txt",
				bytes: new Uint8Array(),
			}),
		).rejects.toThrow("empty");

		const binary = await createChatAttachment({
			workspaceId,
			userId,
			fileName: "archive.bin",
			mimeType: "application/octet-stream",
			bytes: new Uint8Array([0, 1, 2, 3, 4]),
		});
		expect(binary).toMatchObject({
			kind: "chat_file",
			category: "file",
			extractionStatus: "unreadable",
		});
		await expect(
			getChatAttachmentExtractedText({
				attachmentId: binary.id,
				workspaceId,
				userId,
			}),
		).resolves.toMatchObject({ text: "" });
		await expect(
			getChatAttachmentBytes({
				attachmentId: binary.id,
				workspaceId: "other",
				userId,
			}),
		).rejects.toThrow("Attachment not found");
		await expect(
			getChatImageAttachmentBytes({
				attachmentId: binary.id,
				workspaceId,
				userId,
			}),
		).rejects.toThrow("Attachment is not an image");

		const badId = "123e4567-e89b-12d3-a456-426614174000";
		storageMock.objects.set(`chat-attachments/${badId}/metadata.json`, {
			bytes: new TextEncoder().encode("not json"),
		});
		await expect(getChatAttachment(badId)).rejects.toThrow(
			"Failed to parse attachment metadata",
		);
		await expect(getChatAttachment("../bad")).rejects.toThrow(
			"Invalid attachment id",
		);

		storageMock.upload.mockRejectedValueOnce(new Error("upload failed"));
		await expect(
			createChatAttachment({
				workspaceId,
				userId,
				fileName: "fail.txt",
				bytes: new TextEncoder().encode("fail"),
			}),
		).rejects.toThrow("upload failed");
		expect(storageMock.delete).toHaveBeenCalled();
	});
});
