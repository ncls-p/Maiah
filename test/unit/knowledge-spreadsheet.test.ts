import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { extractSpreadsheet } from "@/modules/knowledge/extract-spreadsheet";
import { extractKnowledgeUploads } from "@/modules/knowledge/file-ingestion";
import { extractKnowledgeSource } from "@/modules/knowledge/extract-knowledge-source";
import { chunkSpreadsheetRow } from "@/modules/knowledge/spreadsheet-chunks";

async function fixture(build: (book: ExcelJS.Workbook) => void) {
  const book = new ExcelJS.Workbook();
  build(book);
  return new Uint8Array(await book.xlsx.writeBuffer());
}
const read = (bytes: Uint8Array, maxCharacters = 1200) =>
  extractSpreadsheet({ fileName: "export.xlsx", bytes, maxCharacters });

describe("Excel knowledge ingestion", () => {
  it("preserves physical rows, sheet names, sparse cells and duplicate labels", async () => {
    const bytes = await fixture((book) => {
      const sheet = book.addWorksheet("Incidents ITSM");
      sheet.getRow(3).values = ["Number", "Status", "Status", "Owner"];
      sheet.getRow(7).values = [
        "INC000123",
        "Open",
        "Assigned",
        null,
        "VPN failure",
      ];
      const second = book.addWorksheet("Requests");
      second.addRow(["Number", "Description"]);
      second.addRow(["REQ001", "New laptop"]);
      const hidden = book.addWorksheet("Internal", { state: "hidden" });
      hidden.addRow(["Secret"]);
      hidden.addRow(["DO NOT INCLUDE"]);
    });
    const result = await read(bytes);
    expect(result!.chunks).toHaveLength(2);
    expect(result!.chunks[0]).toMatchObject({
      metadata: { sourceFormat: "xlsx", sheetIndex: 0, row: 7, part: 1 },
    });
    expect(result!.text).toContain('Sheet "Incidents ITSM"; Excel row 7');
    expect(result!.text).toContain('B "Status": Open');
    expect(result!.text).toContain('C "Status": Assigned');
    expect(result!.text).toContain('D "Owner": [empty]');
    expect(result!.text).toContain('E "[unnamed column]": VPN failure');
    expect(result!.text).toContain('Sheet "Requests"');
    expect(result!.text).not.toContain("DO NOT INCLUDE");
    expect(result!.message).toContain("Hidden worksheets were excluded");
  });

  it("retains booleans, zero, dates, rich text, links, errors and saved formula values without execution", async () => {
    const result = await read(
      await fixture((book) => {
        const s = book.addWorksheet("Values");
        s.addRow([
          "id",
          "zero",
          "bool",
          "date",
          "rich",
          "link",
          "formula",
          "missing",
          "error",
        ]);
        s.addRow([
          "INC1",
          0,
          false,
          new Date("2026-09-01T00:00:00Z"),
          { richText: [{ text: "VPN " }, { text: "outage" }] },
          { text: "Help desk", hyperlink: "https://example.invalid" },
          { formula: "1+2", result: 3 },
          { formula: "NOW()" },
          { error: "#N/A" },
        ]);
      }),
    );
    for (const value of [
      '"zero": 0',
      '"bool": false',
      "2026-09-01T00:00:00.000Z",
      "VPN outage",
      "Help desk",
      '"formula": 3',
      "[formula result unavailable]",
      "[Excel error: #N/A]",
    ])
      expect(result!.text).toContain(value);
    expect(result!.message).toContain("no saved result");
    expect(result!.text).not.toContain("NOW()");
  });

  it("keeps every character of a long field, repeating source and column in bounded chunks", () => {
    const value = "abcdefghijklmnop ".repeat(150);
    const chunks = chunkSpreadsheetRow({
      sheet: "ITSM",
      sheetIndex: 0,
      row: 42,
      fields: [{ column: "A", header: "Description", value }],
      maxCharacters: 200,
    });
    expect(chunks.length).toBeGreaterThan(10);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(200);
      expect(chunk.content).toContain('Sheet "ITSM"; Excel row 42');
      expect(chunk.content).toContain('A "Description": ');
    }
    expect(
      chunks
        .map((c) => c.content.split('A "Description": ')[1].slice(0, -1))
        .join(""),
    ).toBe(value);
  });

  it("uses the same chunks after a rename and re-extraction, and through ZIP uploads", async () => {
    const bytes = await fixture((book) => {
      const s = book.addWorksheet("Incidents");
      s.addRow(["Number"]);
      s.addRow(["INC777"]);
    });
    const zip = new JSZip();
    zip.file("folder/export.xlsx", bytes);
    const uploaded = await extractKnowledgeUploads([
      {
        fileName: "bundle.zip",
        bytes: await zip.generateAsync({ type: "uint8array" }),
      },
    ]);
    expect(uploaded.rejected).toEqual([]);
    const file = uploaded.files[0];
    const reextracted = await extractKnowledgeSource({
      fileName: "Renamed export",
      bytes,
      mimeType: file.mimeType,
    });
    expect(reextracted.chunks).toEqual(file.chunks);
    expect(file.originalBytes).toEqual(bytes);
  });

  it("does not route non-spreadsheets through the Excel parser", async () => {
    expect(
      await extractSpreadsheet({
        fileName: "notes.txt",
        bytes: new Uint8Array(),
        maxCharacters: 1200,
      }),
    ).toBeNull();
  });

  it("rejects invalid, empty and header-only workbooks independently of other uploads", async () => {
    const empty = await fixture((book) => book.addWorksheet("Empty"));
    await expect(read(empty)).rejects.toThrow("No data rows");
    const header = await fixture((book) =>
      book.addWorksheet("Headers").addRow(["Number"]),
    );
    await expect(read(header)).rejects.toThrow("No data rows");
    const result = await extractKnowledgeUploads([
      { fileName: "bad.xlsx", bytes: new Uint8Array([1, 2]) },
      { fileName: "ok.txt", bytes: new TextEncoder().encode("usable") },
    ]);
    expect(result.rejected[0].title).toBe("bad.xlsx");
    expect(result.files[0].title).toBe("ok.txt");
  });

  it("rejects oversized archives, rows and headers instead of silently truncating", async () => {
    await expect(read(new Uint8Array(16 * 1024 * 1024 + 1))).rejects.toThrow(
      "16 MiB",
    );
    await expect(
      read(
        await fixture((book) => {
          const s = book.addWorksheet("Wide");
          s.getCell("IW1").value = "Too wide";
        }),
      ),
    ).rejects.toThrow("256 columns");
    expect(() =>
      chunkSpreadsheetRow({
        sheet: "s",
        sheetIndex: 0,
        row: 2,
        fields: [{ column: "A", header: "H".repeat(200), value: "a" }],
        maxCharacters: 200,
      }),
    ).toThrow("headers exceed");
  });

  it("rejects the entire workbook when its chunk budget is exceeded", async () => {
    const bytes = await fixture((book) => {
      const s = book.addWorksheet("Rows");
      s.addRow(["Number"]);
      for (let i = 0; i < 8001; i++) s.addRow([`INC${i}`]);
    });
    await expect(read(bytes)).rejects.toThrow("indexing limit");
  });
});

it("keeps UTF-16 characters intact at field fragment boundaries", () => {
  const value = "a🧩".repeat(300);
  const chunks = chunkSpreadsheetRow({
    sheet: "Test",
    sheetIndex: 0,
    row: 2,
    fields: [{ column: "A", header: "h", value }],
    maxCharacters: 200,
  });
  const pieces = chunks.map((c) => c.content.split('A "h": ')[1].slice(0, -1));
  expect(pieces.join("")).toBe(value);
  for (const piece of pieces) expect(Buffer.from(piece).toString()).toBe(piece);
});

it("bounds actual inflated bytes and archive entry count before parsing", async () => {
  const bomb = new JSZip();
  bomb.file("large.xml", new Uint8Array(65 * 1024 * 1024));
  await expect(
    read(
      await bomb.generateAsync({ type: "uint8array", compression: "DEFLATE" }),
    ),
  ).rejects.toThrow("64 MiB");
  const many = new JSZip();
  for (let i = 0; i < 2001; i++) many.file(`${i}.xml`, "");
  await expect(
    read(await many.generateAsync({ type: "uint8array" })),
  ).rejects.toThrow("too many entries");
});

it("handles XLSM by MIME after rename and retains cached zero/false values", async () => {
  const bytes = await fixture((book) => {
    const s = book.addWorksheet("Formula");
    s.addRow(["zero", "false"]);
    s.addRow([
      { formula: "0", result: 0 },
      { formula: "FALSE()", result: false },
    ]);
  });
  const result = await extractSpreadsheet({
    fileName: "renamed",
    mimeType: "application/vnd.ms-excel.sheet.macroEnabled.12",
    bytes,
    maxCharacters: 1200,
  });
  expect(result!.text).toContain('A "zero": 0');
  expect(result!.text).toContain('B "false": false');
  expect(result!.mimeType).toBe(
    "application/vnd.ms-excel.sheet.macroEnabled.12",
  );
});
