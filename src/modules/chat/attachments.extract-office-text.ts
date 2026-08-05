import JSZip from "jszip";
import { PDFParse } from "pdf-parse";
import "pdf-parse/worker";

import {
AttachmentDetection,
maxOfficeXmlBytes,
maxPdfPages,
utf8Decoder,
} from "./attachments.chat-image-attachment";
import {
decodeXmlEntities,
limitExtractedText,
normalizeExtractedText,
} from "./attachments.detect-attachment";
import {
declaredZipUncompressedSize,
extractDocxMarkdown,
extractSharedStrings,
extractXmlText,
markdownTable,
spreadsheetColumnIndex,
zipEntryNumber,
} from "./attachments.markdown-table";

function extractWorksheetMarkdown(xml: string, sharedStrings: string[]) {
  const rows = new Map<number, Map<number, string>>();
  for (const match of xml.matchAll(
    /<(?:[a-z0-9_-]+:)?c\b([^>]*)>([\s\S]*?)<\/(?:[a-z0-9_-]+:)?c>/gi,
  )) {
    const attributes = match[1];
    const body = match[2];
    const reference = attributes.match(/\br=["']([^"']+)["']/i)?.[1] ?? "A1";
    const rowIndex = Number.parseInt(reference.match(/\d+$/)?.[0] ?? "1", 10);
    const columnIndex = spreadsheetColumnIndex(reference);
    const type = attributes.match(/\bt=["']([^"']+)["']/i)?.[1];
    const rawValue = body.match(
      /<(?:[a-z0-9_-]+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-z0-9_-]+:)?v>/i,
    )?.[1];
    const value =
      type === "s" && rawValue !== undefined
        ? (sharedStrings[Number.parseInt(rawValue, 10)] ?? rawValue)
        : type === "inlineStr"
          ? extractXmlText(body)
          : decodeXmlEntities(rawValue ?? extractXmlText(body));
    const row = rows.get(rowIndex) ?? new Map<number, string>();
    row.set(columnIndex, normalizeExtractedText(value));
    rows.set(rowIndex, row);
  }

  const tableRows = Array.from(rows.entries())
    .sort(([left], [right]) => left - right)
    .map(([, cells]) => {
      const width = Math.max(0, ...cells.keys()) + 1;
      return Array.from(
        { length: width },
        (_, index) => cells.get(index) ?? "",
      );
    });
  return markdownTable(tableRows);
}

export async function extractOfficeText(
  bytes: Uint8Array,
  textKind: Extract<AttachmentDetection["textKind"], "docx" | "pptx" | "xlsx">,
) {
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .filter((entry) => {
      if (textKind === "docx") {
        return (
          /^word\/(?:document|footnotes|endnotes|comments)\.xml$/i.test(
            entry.name,
          ) || /^word\/(?:header|footer)\d+\.xml$/i.test(entry.name)
        );
      }
      if (textKind === "pptx")
        return /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name);
      return /^xl\/(?:sharedStrings|worksheets\/sheet\d+)\.xml$/i.test(
        entry.name,
      );
    })
    .sort((a, b) => zipEntryNumber(a.name) - zipEntryNumber(b.name));

  let totalXmlBytes = 0;
  let truncated = false;
  const loadedEntries: Array<{ name: string; xml: string }> = [];

  for (const entry of entries) {
    const declaredSize = declaredZipUncompressedSize(entry);
    if (declaredSize && totalXmlBytes + declaredSize > maxOfficeXmlBytes) {
      truncated = true;
      break;
    }
    const xmlBytes = await entry.async("uint8array");
    totalXmlBytes += xmlBytes.byteLength;
    if (totalXmlBytes > maxOfficeXmlBytes) {
      truncated = true;
      break;
    }
    loadedEntries.push({ name: entry.name, xml: utf8Decoder.decode(xmlBytes) });
  }

  let markdown = "";
  if (textKind === "docx") {
    markdown = loadedEntries
      .map((entry) => extractDocxMarkdown(entry.xml))
      .filter(Boolean)
      .join("\n\n");
  } else if (textKind === "pptx") {
    markdown = loadedEntries
      .map((entry) => {
        const text = normalizeExtractedText(extractXmlText(entry.xml));
        return text ? `## Slide ${zipEntryNumber(entry.name)}\n\n${text}` : "";
      })
      .filter(Boolean)
      .join("\n\n");
  } else {
    const sharedStringsEntry = loadedEntries.find((entry) =>
      /xl\/sharedStrings\.xml$/i.test(entry.name),
    );
    const sharedStrings = sharedStringsEntry
      ? extractSharedStrings(sharedStringsEntry.xml)
      : [];
    markdown = loadedEntries
      .filter((entry) => /xl\/worksheets\/sheet\d+\.xml$/i.test(entry.name))
      .map((entry) => {
        const table = extractWorksheetMarkdown(entry.xml, sharedStrings);
        return table
          ? `## Sheet ${zipEntryNumber(entry.name)}\n\n${table}`
          : "";
      })
      .filter(Boolean)
      .join("\n\n");
  }

  return limitExtractedText(
    markdown,
    truncated
      ? "The document was partially read because it is large."
      : undefined,
    truncated,
  );
}

export async function extractPdfMarkdown(bytes: Uint8Array) {
  const parser = new PDFParse({ data: Buffer.from(bytes) });
  try {
    const result = await parser.getText({ first: maxPdfPages });
    const markdown = result.pages
      .map((page) => {
        const text = normalizeExtractedText(page.text);
        return text ? `## Page ${page.num}\n\n${text}` : "";
      })
      .filter(Boolean)
      .join("\n\n");
    const pagesTruncated = result.total > result.pages.length;
    return limitExtractedText(
      markdown,
      pagesTruncated
        ? `Only the first ${maxPdfPages} PDF pages were extracted.`
        : markdown
          ? undefined
          : "No readable text was found in this PDF; scanned pages may require OCR.",
      pagesTruncated,
    );
  } finally {
    await parser.destroy();
  }
}

export function stripRtf(value: string) {
  return value
    .replace(/\\'[0-9a-fA-F]{2}/g, " ")
    .replace(/\\[a-zA-Z]+-?\d* ?/g, " ")
    .replace(/[{}]/g, " ");
}
