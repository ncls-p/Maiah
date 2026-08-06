import JSZip from "jszip";
import { beforeEach,describe,expect,it,vi } from "vitest";

import { textPdfBytes } from "../fixtures/pdf";

const storageMock = vi.hoisted(() => {
  const objects = new Map<string, { bytes: Uint8Array; contentType?: string }>();
  return {
    objects,
    upload: vi.fn(async (key: string, value: Uint8Array | string, contentType?: string) => {
      objects.set(key, {
        bytes: typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value),
        contentType,
      });
    }),
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

import { createChatAttachment,createChatImageAttachment,getChatAttachment,getChatAttachmentExtractedText,getChatImageAttachmentBytes,isChatFileAttachment,isChatImageAttachment,publicChatAttachment } from "@/modules/chat/attachments";

const workspaceId = "ws-1";
const userId = "user-1";

function pngBytes() {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
}

async function docxBytes() {
  const zip = new JSZip();
  zip.file("word/document.xml", "<w:document><w:t>Hello &amp; welcome</w:t></w:document>");
  zip.file("word/header1.xml", "<w:t>Header</w:t>");
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
    expect((rtf as Extract<typeof rtf, { kind: "chat_file" }>).extractedTextChars).toBeGreaterThan(0);

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
      text: expect.stringContaining("Hello PDF"),
    });
    expect(Array.from(storageMock.objects.entries()).some(([key, object]) => key.endsWith("/extracted.md") && object.contentType === "text/markdown; charset=utf-8")).toBe(true);

    const docx = await createChatAttachment({
      workspaceId,
      userId,
      fileName: "word.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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
});
