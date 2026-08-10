import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  getChatAttachmentExtractedText,
} from "@/modules/chat/attachments";

const workspaceId = "ws-1";
const userId = "user-1";

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
    expect(binaryPdfText.text).toContain("Visible PDF text");
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
});
