import ExcelJS from "exceljs";
import JSZip from "jszip";
import {
  chunkSpreadsheetRow,
  type KnowledgeSourceChunk,
} from "./spreadsheet-chunks";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_BYTES = 16 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 64 * 1024 * 1024;
const MAX_CHUNKS = 8_000;
const MAX_TEXT = 8_000_000;

// Check actual inflated bytes before ExcelJS builds an in-memory workbook.
async function validateArchive(bytes: Uint8Array) {
  if (bytes.length > MAX_BYTES)
    throw new Error(
      "Excel file exceeds 16 MiB. Split the export into smaller files.",
    );
  const archive = await JSZip.loadAsync(bytes);
  const entries = Object.values(archive.files).filter((entry) => !entry.dir);
  if (entries.length > 2_000)
    throw new Error("Excel archive contains too many entries.");
  let total = 0;
  for (const entry of entries) {
    await new Promise<void>((resolve, reject) => {
      const stream = entry.nodeStream("nodebuffer");
      stream.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_EXPANDED_BYTES) {
          stream.pause();
          reject(
            new Error(
              "Expanded Excel file exceeds 64 MiB. Split the export into smaller files.",
            ),
          );
        }
      });
      stream.on("error", reject);
      stream.on("end", resolve);
    });
  }
}

function cellText(
  value: ExcelJS.CellValue,
  warnings: Set<string>,
  cachedResult?: ExcelJS.CellFormulaValue["result"],
): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return String(value);
  if ("formula" in value || "sharedFormula" in value) {
    warnings.add(
      "Formula cells use saved results only; formulas are never recalculated.",
    );
    // ExcelJS's public value getter drops false/zero formula results.
    // The public result getter preserves them.
    const result = cachedResult ?? value.result;
    if (result === undefined || result === null) {
      warnings.add(
        "Some formulas have no saved result. Recalculate and save the workbook in Excel before uploading.",
      );
      return "[formula result unavailable]";
    }
    return cellText(result, warnings);
  }
  if ("richText" in value)
    return value.richText.map((part) => part.text).join("");
  if ("text" in value) return value.text;
  if ("error" in value) return `[Excel error: ${value.error}]`;
  return "";
}

/** XLSX/XLSM only. Other document formats keep their existing extractor. */
export async function extractSpreadsheet(input: {
  fileName: string;
  mimeType?: string;
  bytes: Uint8Array;
  maxCharacters: number;
}) {
  const mime = input.mimeType?.split(";", 1)[0]?.toLowerCase();
  const supported =
    /\.(xlsx|xlsm)$/i.test(input.fileName) ||
    mime === XLSX_MIME ||
    mime === "application/vnd.ms-excel.sheet.macroenabled.12";
  if (!supported) return null;
  await validateArchive(input.bytes);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(input.bytes).buffer, {
    ignoreNodes: ["drawing", "picture", "extLst", "mergeCells"],
  });
  const warnings = new Set<string>([
    "Tabular retrieval returns excerpts, not exhaustive statistics. The first non-empty row of each visible sheet is used as headers. Hidden rows and columns are included; hidden sheets are excluded. Charts and images are not extracted; merged cells retain only their stored value.",
  ]);
  const chunks: KnowledgeSourceChunk[] = [];
  let textLength = 0;
  let rows = 0;
  workbook.worksheets.forEach((sheet, sheetIndex) => {
    if (sheet.state !== "visible") {
      warnings.add("Hidden worksheets were excluded.");
      return;
    }
    let headers: Map<number, string> | undefined;
    sheet.eachRow((row, rowNumber) => {
      if (++rows > 10_000)
        throw new Error(
          "Excel export exceeds 10,000 non-empty rows. Split the export into smaller files.",
        );
      if (row.cellCount > 256)
        throw new Error(
          "Excel export exceeds 256 columns. Export only the relevant fields.",
        );
      if (!headers) {
        headers = new Map();
        row.eachCell((cell, column) =>
          headers!.set(column, cellText(cell.value, warnings, cell.result)),
        );
        return;
      }
      const fields: Array<{ column: string; header: string; value: string }> =
        [];
      // Keep blank columns aligned and retain columns absent from the header.
      const width = Math.max(row.cellCount, ...headers.keys());
      for (let column = 1; column <= width; column++) {
        const cell = row.getCell(column);
        if (!headers.has(column) && cell.value == null) continue;
        fields.push({
          column: cell.address.replace(/\d+$/, ""),
          header: headers.get(column) || "[unnamed column]",
          value: cellText(cell.value, warnings, cell.result),
        });
      }
      for (const chunk of chunkSpreadsheetRow({
        sheet: sheet.name,
        sheetIndex,
        row: rowNumber,
        fields,
        maxCharacters: input.maxCharacters,
        remainingChunks: MAX_CHUNKS - chunks.length,
        remainingCharacters: MAX_TEXT - textLength,
      })) {
        textLength += chunk.content.length;
        chunks.push(chunk);
      }
    });
  });
  if (!chunks.length)
    throw new Error(
      "No data rows found in visible Excel worksheets. Include a header row followed by data.",
    );
  return {
    text: chunks.map((chunk) => chunk.content).join("\n\n"),
    chunks,
    mimeType:
      /\.xlsm$/i.test(input.fileName) ||
      mime === "application/vnd.ms-excel.sheet.macroenabled.12"
        ? "application/vnd.ms-excel.sheet.macroEnabled.12"
        : XLSX_MIME,
    status: "readable" as const,
    message: [...warnings].join(" "),
  };
}
