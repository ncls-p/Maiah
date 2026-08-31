import {
  declaredZipUncompressedSize,
  extractDocxMarkdown,
  extractSharedStrings,
  extractXmlText,
  markdownTable,
  spreadsheetColumnIndex,
  textAttachmentToMarkdown,
  zipEntryNumber,
} from "@/modules/chat/attachments.markdown-table";
import type { AttachmentDetection } from "@/modules/chat/attachments.chat-image-attachment";
import { describe, expect, it } from "vitest";

function detection(extension: string): AttachmentDetection {
  return { extension } as unknown as AttachmentDetection;
}

describe("markdown table branch coverage", () => {
  it("returns an empty string for no rows", () => {
    expect(markdownTable([])).toBe("");
  });

  it("pads short rows and escapes cell content", () => {
    const table = markdownTable([
      ["Name", "Note"],
      ["A | B"],
    ]);
    expect(table).toBe(
      [
        "| Name | Note |",
        "| --- | --- |",
        "| A \\| B |  |",
      ].join("\n"),
    );
  });

  it("turns newlines into <br> and trims cells", () => {
    const table = markdownTable([["A"], ["line1\nline2"]]);
    expect(table).toContain("line1<br>line2");
  });

  it("truncates wide tables and says so", () => {
    const wide = Array.from({ length: 101 }, (_, i) => `c${i}`);
    const table = markdownTable([wide, wide]);
    expect(table).toContain("Table truncated during Markdown conversion.");
    expect(table.split("\n")[0].split("|").length - 2).toBe(100);
  });

  it("truncates tall tables and says so", () => {
    const rows = Array.from({ length: 2001 }, (_, i) => [`r${i}`]);
    const table = markdownTable(rows);
    expect(table).toContain("Table truncated during Markdown conversion.");
    expect(table).not.toContain("r2000");
  });

  it("renders a plain table without the truncation note", () => {
    const table = markdownTable([["A"], ["1"]]);
    expect(table).not.toContain("truncated");
  });

  it("parses quoted fields, escaped quotes, CRLF, and empty rows", () => {
    const csv = 'a,"b""c",d\r\n\r\n1,2,3\n,,"trailing"';
    expect(textAttachmentToMarkdown(csv, detection(".csv"))).toContain(
      "b\"c",
    );
    expect(textAttachmentToMarkdown(csv, detection(".csv"))).toContain(
      "| 1 | 2 | 3 |",
    );
    expect(textAttachmentToMarkdown("\n\n", detection(".csv"))).toBe("");
  });

  it("renders tsv through the tab delimiter", () => {
    const tsv = "a\tb\n1\t2";
    expect(textAttachmentToMarkdown(tsv, detection(".tsv"))).toContain(
      "| a | b |",
    );
  });

  it("renders html through turndown", () => {
    const html = "<ul><li>one</li><li>two</li></ul>";
    const down = textAttachmentToMarkdown(html, detection(".html"));
    expect(down).toContain("one");
    expect(down).toContain("two");
  });

  it("fences known code languages and passes through unknown ones", () => {
    const code = "const x = 1;\nconst y = 2;";
    const fenced = textAttachmentToMarkdown(code, detection(".py"));
    expect(fenced).toContain("```python");
    expect(fenced).toContain("const x = 1;");
    const unknown = textAttachmentToMarkdown("plain text", detection(".xyz"));
    expect(unknown).toBe("plain text");
  });

  it("uses a longer fence when the content contains backticks", () => {
    const value = "line\n```\nmore";
    const fenced = textAttachmentToMarkdown(value, detection(".py"));
    expect(fenced).toContain("````python");
  });

  it("returns an empty string when the extracted text normalizes to nothing", () => {
    expect(textAttachmentToMarkdown("   ", detection(".txt"))).toBe("");
  });

  it("extracts docx text nodes and falls back to stripped xml", () => {
    expect(
      extractXmlText(
        '<w:document><w:p><w:r><w:t>Hello</w:t></w:r></w:p><w:p><w:r><w:t>World</w:t></w:r></w:p></w:document>',
      ),
    ).toBe("Hello World");
    expect(extractXmlText("<div>a <b>b</b> c</div>")).toBe(" a  b  c ");
  });

  it("decodes xml entities while extracting text", () => {
    expect(extractXmlText("<t>a &amp; b</t>")).toBe("a & b");
  });

  it("extracts docx markdown with headings, title, and empty paragraphs", () => {
    const xml = [
      "<w:p><w:pPr><w:pStyle w:val=\"Heading1\"/></w:pPr><w:r><w:t>Title text</w:t></w:r></w:p>",
      "<w:p><w:pPr><w:pStyle w:val=\"Heading3\"/></w:pPr><w:r><w:t>Sub text</w:t></w:r></w:p>",
      "<w:p><w:pPr><w:pStyle w:val=\"Title\"/></w:pPr><w:r><w:t>Doc title</w:t></w:r></w:p>",
      "<w:p><w:pPr><w:pStyle w:val=\"Subtitle\"/></w:pPr><w:r><w:t>Doc subtitle</w:t></w:r></w:p>",
      "<w:p><w:r><w:t>   </w:t></w:r></w:p>",
      "<w:p><w:r><w:t>Body</w:t></w:r></w:p>",
    ].join("");
    const markdown = extractDocxMarkdown(xml);
    expect(markdown).toContain("# Title text");
    expect(markdown).toContain("### Sub text");
    expect(markdown).toContain("# Doc title");
    expect(markdown).toContain("# Doc subtitle");
    expect(markdown).toContain("Body");
  });

  it("falls back to raw xml text when no paragraphs exist", () => {
    expect(extractDocxMarkdown("<t>only text</t>")).toBe("only text");
  });

  it("orders zip entries by their xml number", () => {
    expect(zipEntryNumber("word/document.xml")).toBe(Number.MAX_SAFE_INTEGER);
    expect(zipEntryNumber("word/header2.xml")).toBe(2);
    expect(zipEntryNumber("xl/sheet1.xml")).toBe(1);
    expect(zipEntryNumber("no-number.xml")).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("reads declared zip uncompressed sizes defensively", () => {
    expect(
      declaredZipUncompressedSize({
        _data: { uncompressedSize: 123 },
      } as never),
    ).toBe(123);
    expect(
      declaredZipUncompressedSize({
        _data: { uncompressedSize: "big" },
      } as never),
    ).toBeNull();
    expect(declaredZipUncompressedSize({} as never)).toBeNull();
  });

  it("computes spreadsheet column indexes", () => {
    expect(spreadsheetColumnIndex("A1")).toBe(0);
    expect(spreadsheetColumnIndex("z9")).toBe(25);
    expect(spreadsheetColumnIndex("AB12")).toBe(27);
    expect(spreadsheetColumnIndex("123")).toBe(0);
  });

  it("extracts shared strings from xlsx xml", () => {
    const xml =
      "<sst><si><t>alpha</t></si><si><r><t>beta</t></r><r><t>gamma</t></r></si></sst>";
    expect(extractSharedStrings(xml)).toEqual(["alpha", "beta gamma"]);
  });
});