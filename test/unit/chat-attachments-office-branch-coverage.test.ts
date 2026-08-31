import JSZip from "jszip";
import {
  extractOfficeText,
  extractPdfMarkdown,
  stripRtf,
} from "@/modules/chat/attachments.extract-office-text";
import { PDFParse } from "pdf-parse";
import { beforeEach, describe, expect, it, vi } from "vitest";

type PdfResult = {
  pages: Array<{ num: number; text: string }>;
  total: number;
};

type FakePdfParseCtor = {
  new (opts: { data: Buffer }): {
    destroyed: boolean;
    result: PdfResult;
    getText(): Promise<PdfResult>;
    destroy(): Promise<void>;
  };
  instances: Array<{ destroyed: boolean }>;
  nextResult: PdfResult | null;
};

vi.mock("pdf-parse", () => {
  class FakePDFParse {
    static instances: FakePDFParse[] = [];
    static nextResult: PdfResult | null = null;
    destroyed = false;
    result: PdfResult;
    constructor(_opts: { data: Buffer }) {
      this.result =
        FakePDFParse.nextResult ??
        { pages: [{ num: 1, text: "Hello PDF" }], total: 1 };
      FakePDFParse.instances.push(this);
    }
    async getText() {
      return this.result;
    }
    async destroy() {
      this.destroyed = true;
    }
  }
  return { PDFParse: FakePDFParse };
});

const fakePdf = PDFParse as unknown as FakePdfParseCtor;

beforeEach(() => {
  fakePdf.instances = [];
  fakePdf.nextResult = null;
});

async function zipBytes(files: Record<string, string>) {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generateAsync({ type: "uint8array" });
}

describe("office text extraction branch coverage", () => {
  it("extracts docx from every matched part and skips the rest", async () => {
    const bytes = await zipBytes({
      "[Content_Types].xml": "<Types>ignored</Types>",
      "word/styles.xml": "<w:styles>style noise</w:styles>",
      "word/document.xml":
        "<w:document><w:p><w:r><w:t>Body text</w:t></w:r></w:p></w:document>",
      "word/header1.xml": "<w:t>Head text</w:t>",
      "word/footer2.xml": "<w:t>Foot text</w:t>",
      "word/comments.xml": "<w:t>Comment text</w:t>",
      "word/footnotes.xml": "<w:t>Footnote text</w:t>",
      "word/endnotes.xml": "<w:t>Endnote text</w:t>",
    });
    const result = await extractOfficeText(bytes, "docx");
    expect(result.status).toBe("readable");
    for (const text of [
      "Body text",
      "Head text",
      "Foot text",
      "Comment text",
      "Footnote text",
      "Endnote text",
    ]) {
      expect(result.text).toContain(text);
    }
    expect(result.text).not.toContain("style noise");
    expect(result.text).not.toContain("ignored");
  });

  it("extracts pptx slides by number and skips empty slides", async () => {
    const bytes = await zipBytes({
      "ppt/slides/slide1.xml": "<a:t>First slide</a:t>",
      "ppt/slides/slide2.xml": "<a:t>   </a:t>",
      "ppt/slides/slide3.xml": "<a:t>Third slide</a:t>",
    });
    const result = await extractOfficeText(bytes, "pptx");
    expect(result.text).toContain("## Slide 1");
    expect(result.text).toContain("First slide");
    expect(result.text).toContain("## Slide 3");
    expect(result.text).not.toContain("## Slide 2");
  });

  it("extracts xlsx cells from shared strings, inline strings, and values", async () => {
    const bytes = await zipBytes({
      "xl/sharedStrings.xml":
        "<sst><si><t>Name</t></si><si><t>Value</t></si></sst>",
      "xl/worksheets/sheet1.xml":
        '<worksheet><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>99</v></c><c r="A2" t="inlineStr"><is><t>Inline cell</t></is></c><c r="B2"><v>42</v></c><c r="C2"><is><t>Untyped inline</t></is></c></worksheet>',
    });
    const result = await extractOfficeText(bytes, "xlsx");
    expect(result.text).toContain("## Sheet 1");
    expect(result.text).toContain("Name");
    expect(result.text).toContain("Value");
    expect(result.text).toContain("99");
    expect(result.text).toContain("Inline cell");
    expect(result.text).toContain("42");
    expect(result.text).toContain("Untyped inline");
  });

  it("defaults cells without a reference to A1 and copes with missing shared strings", async () => {
    const bytes = await zipBytes({
      "xl/worksheets/sheet2.xml":
        '<worksheet><c t="s"><v>0</v></c></worksheet>',
    });
    const result = await extractOfficeText(bytes, "xlsx");
    expect(result.text).toContain("## Sheet 2");
    expect(result.text).toContain("0");
  });

  it("truncates office documents whose xml exceeds the byte budget", async () => {
    const big = "<w:document><w:p><w:r><w:t>" + "x".repeat(8 * 1024 * 1024 + 1024) + "</w:t></w:r></w:p></w:document>";
    const bytes = await zipBytes({ "word/document.xml": big });
    const result = await extractOfficeText(bytes, "docx");
    expect(result.status).toBe("unreadable");
    expect(result.message).toBe(
      "The document was partially read because it is large.",
    );
  });

  it("extracts pdf markdown and destroys the parser", async () => {
    const result = await extractPdfMarkdown(new Uint8Array([1, 2, 3]));
    expect(result.status).toBe("readable");
    expect(result.text).toContain("## Page 1");
    expect(result.text).toContain("Hello PDF");
    expect(fakePdf.instances[0].destroyed).toBe(true);
  });

  it("reports pdfs without readable text as scan candidates", async () => {
    fakePdf.nextResult = {
      pages: [{ num: 1, text: "   " }],
      total: 1,
    };
    const result = await extractPdfMarkdown(new Uint8Array([1]));
    expect(result.status).toBe("unreadable");
    expect(result.message).toContain("scanned pages may require OCR");
  });

  it("reports truncated pdfs when more pages exist than extracted", async () => {
    fakePdf.nextResult = {
      pages: [
        { num: 1, text: "one" },
        { num: 2, text: "two" },
      ],
      total: 501,
    };
    const result = await extractPdfMarkdown(new Uint8Array([1]));
    expect(result.status).toBe("truncated");
    expect(result.message).toContain("Only the first 500 PDF pages");
  });

  it("strips rtf control words, hex escapes, and braces", () => {
    const stripped = stripRtf(
      "{\\rtf1\\ansi\\deff0\\par \'e9café\\b0 bold{text}}",
    );
    expect(stripped).not.toMatch(/[{}\\]/);
    expect(stripped).toContain("café");
    expect(stripped).toContain("bold text");
  });
});