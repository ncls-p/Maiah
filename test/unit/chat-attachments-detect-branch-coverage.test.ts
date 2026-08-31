import {
  detectAttachment,
  decodeXmlEntities,
  limitExtractedText,
  normalizeExtractedText,
} from "@/modules/chat/attachments.detect-attachment";
import { maxStoredChatAttachmentMarkdownChars } from "@/modules/chat/attachments.chat-image-attachment";
import { describe, expect, it } from "vitest";

function utf8(text: string) {
  return new TextEncoder().encode(text);
}

const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
const binaryBytes = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe]);

describe("attachment detection branch coverage", () => {
  it("detects pdf files by signature and by declared mime type", () => {
    expect(detectAttachment({ fileName: "doc.pdf", bytes: utf8("%PDF-1.4") })
      .textKind).toBe("pdf");
    expect(
      detectAttachment({
        fileName: "doc.bin",
        declaredMimeType: "application/pdf",
        bytes: binaryBytes,
      }).textKind,
    ).toBe("pdf");
  });

  it("detects office files from zip signature and declared mime type", () => {
    expect(
      detectAttachment({
        fileName: "doc",
        declaredMimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        bytes: zipBytes,
      }).textKind,
    ).toBe("docx");
    expect(
      detectAttachment({
        fileName: "sheet",
        declaredMimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        bytes: zipBytes,
      }).textKind,
    ).toBe("xlsx");
  });

  it("detects code text files by extension", () => {
    const detection = detectAttachment({
      fileName: "script.py",
      bytes: utf8("print('hi')"),
    });
    expect(detection.extension).toBe(".py");
    expect(detection.category).toBe("text");
  });

  it("detects declared text mime types with rtf and markdown kinds", () => {
    expect(
      detectAttachment({
        fileName: "notes",
        declaredMimeType: "text/rtf",
        bytes: utf8("{\\rtf1}"),
      }).textKind,
    ).toBe("rtf");
    expect(
      detectAttachment({
        fileName: "notes",
        declaredMimeType: "text/markdown",
        bytes: utf8("# Title"),
      }).textKind,
    ).toBe("markdown");
    const plain = detectAttachment({
      fileName: "notes",
      declaredMimeType: "text/plain",
      bytes: utf8("hello"),
    });
    expect(plain.textKind).toBe("text");
    expect(plain.extension).toBe(".txt");
  });

  it("falls back to utf8 detection for non-text declared types", () => {
    const detection = detectAttachment({
      fileName: "data.xyz",
      declaredMimeType: "image/svg+xml",
      bytes: utf8('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    });
    expect(detection.mimeType).toBe("text/plain; charset=utf-8");
    expect(detection.extension).toBe(".xyz");
    const textDeclared = detectAttachment({
      fileName: "data.xyz",
      declaredMimeType: "text/csv",
      bytes: utf8("a,b"),
    });
    expect(textDeclared.mimeType).toBe("text/csv; charset=utf-8");
  });

  it("rejects empty, nulled, control-heavy, and invalid utf8 bytes", () => {
    expect(
      detectAttachment({
        fileName: "empty.xyz",
        bytes: new Uint8Array(),
      }).category,
    ).toBe("text");
    expect(
      detectAttachment({
        fileName: "nulled.xyz",
        bytes: new Uint8Array([0x61, 0x00, 0x62]),
      }).category,
    ).toBe("file");
    const controlHeavy = new Uint8Array(100).fill(0x07);
    expect(
      detectAttachment({ fileName: "ctrl.xyz", bytes: controlHeavy }).category,
    ).toBe("file");
    expect(
      detectAttachment({
        fileName: "bad.xyz",
        bytes: new Uint8Array([0xff, 0xfe, 0xfd]),
      }).category,
    ).toBe("file");
  });

  it("falls back to a generic file attachment", () => {
    const bare = detectAttachment({ fileName: "blob", bytes: binaryBytes });
    expect(bare.mimeType).toBe("application/octet-stream");
    expect(bare.extension).toBe(".bin");
    const custom = detectAttachment({
      fileName: "blob.weird",
      declaredMimeType: "image/x-custom",
      bytes: binaryBytes,
    });
    expect(custom.mimeType).toBe("image/x-custom");
    expect(custom.extension).toBe(".weird");
  });

  it("normalizes extracted text", () => {
    expect(normalizeExtractedText("\u0000a\r\nb   \n\n\n\n\nc")).toBe(
      "a\nb\n\n\nc",
    );
  });

  it("limits extracted text into readable, truncated, and unreadable states", () => {
    const unreadable = limitExtractedText("   ");
    expect(unreadable.status).toBe("unreadable");
    expect(unreadable.message).toBe(
      "No readable text could be extracted from this file.",
    );
    const unreadableCustom = limitExtractedText("", "Custom note");
    expect(unreadableCustom.message).toBe("Custom note");
    const readable = limitExtractedText("short text");
    expect(readable.status).toBe("readable");
    expect(readable.text).toBe("short text");
    const forced = limitExtractedText("short text", undefined, true);
    expect(forced.status).toBe("truncated");
    const longText = "x".repeat(maxStoredChatAttachmentMarkdownChars + 10);
    const truncated = limitExtractedText(longText);
    expect(truncated.status).toBe("truncated");
    expect(truncated.text).toContain("[Attachment text truncated for safety.]");
    expect(truncated.message).toContain(
      maxStoredChatAttachmentMarkdownChars.toLocaleString(),
    );
    const truncatedCustom = limitExtractedText(longText, "Custom cap");
    expect(truncatedCustom.message).toBe("Custom cap");
  });

  it("decodes every xml entity form", () => {
    expect(decodeXmlEntities("&lt;&gt;&quot;&apos;&amp;")).toBe(
      '<>"\'&',
    );
    expect(decodeXmlEntities("&#65;&#x42;")).toBe("AB");
  });
});