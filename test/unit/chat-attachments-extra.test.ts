import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

import { textPdfBytes } from "../fixtures/pdf";

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
	else {
		zip.file(
			"xl/sharedStrings.xml",
			"<sst><si><t>Name</t></si><si><t>Value</t></si><si><t>Alpha</t></si></sst>",
		);
		zip.file(
			"xl/worksheets/sheet1.xml",
			'<worksheet><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>42</v></c></row></worksheet>',
		);
	}
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
			bytes: textPdfBytes("Hello PDF"),
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
			text: "## Page 1\n\nHello PDF",
		});
		expect(
			Array.from(storageMock.objects.entries()).some(
				([key, object]) =>
					key.endsWith("/extracted.md") &&
					object.contentType === "text/markdown; charset=utf-8",
			),
		).toBe(true);

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
		).resolves.toMatchObject({
			text: "## Slide 2\n\nSlide <Two>",
		});

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
		await expect(
			getChatAttachmentExtractedText({
				attachmentId: xlsx.id,
				workspaceId,
				userId,
			}),
		).resolves.toMatchObject({
			text: "## Sheet 1\n\n| Name | Value |\n| --- | --- |\n| Alpha | 42 |",
		});

		const navigable = await createChatAttachment({
			workspaceId,
			userId,
			fileName: "navigable.txt",
			bytes: new TextEncoder().encode("n".repeat(130_000)),
		});
		expect(navigable).toMatchObject({
			extractionStatus: "readable",
			extractedTextChars: 130_000,
		});
		await expect(
			getChatAttachmentExtractedText({
				attachmentId: navigable.id,
				workspaceId,
				userId,
			}),
		).resolves.toMatchObject({ text: "n".repeat(130_000) });

		const large = await createChatAttachment({
			workspaceId,
			userId,
			fileName: "large.txt",
			bytes: new TextEncoder().encode("a".repeat(4_010_000)),
		});
		expect(large).toMatchObject({
			extractionStatus: "truncated",
			extractionMessage: expect.stringContaining("partially"),
		});

		const pdfWithBinaryStream = await createChatAttachment({
			workspaceId,
			userId,
			fileName: "binary-stream.pdf",
			bytes: textPdfBytes(
				"Visible PDF text",
				Buffer.concat([
					new Uint8Array([0x00, 0xff, 0x8e, 0x1f, 0x03]),
					Buffer.from("(BINARY GARBAGE) endstream <deadbeef>", "latin1"),
				]),
			),
		});
		const binaryPdfText = await getChatAttachmentExtractedText({
			attachmentId: pdfWithBinaryStream.id,
			workspaceId,
			userId,
		});
		expect(binaryPdfText.text).toBe("## Page 1\n\nVisible PDF text");
		expect(binaryPdfText.text).not.toContain("BINARY GARBAGE");
		expect(binaryPdfText.text).not.toContain("endstream");
	});

	it("converts extracted text formats to Markdown", async () => {
		const html = await createChatAttachment({
			workspaceId,
			userId,
			fileName: "article.html",
			bytes: new TextEncoder().encode(
				"<h1>Title</h1><p>Hello <strong>world</strong>.</p>",
			),
		});
		const csv = await createChatAttachment({
			workspaceId,
			userId,
			fileName: "data.csv",
			bytes: new TextEncoder().encode('Name,Note\nAlpha,"A | B"'),
		});
		const json = await createChatAttachment({
			workspaceId,
			userId,
			fileName: "payload",
			mimeType: "application/json",
			bytes: new TextEncoder().encode('{"ok":true}'),
		});

		await expect(
			getChatAttachmentExtractedText({
				attachmentId: html.id,
				workspaceId,
				userId,
			}),
		).resolves.toMatchObject({ text: "# Title\n\nHello **world**." });
		await expect(
			getChatAttachmentExtractedText({
				attachmentId: csv.id,
				workspaceId,
				userId,
			}),
		).resolves.toMatchObject({
			text: "| Name | Note |\n| --- | --- |\n| Alpha | A \\| B |",
		});
		await expect(
			getChatAttachmentExtractedText({
				attachmentId: json.id,
				workspaceId,
				userId,
			}),
		).resolves.toMatchObject({ text: '```json\n{"ok":true}\n```' });
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
