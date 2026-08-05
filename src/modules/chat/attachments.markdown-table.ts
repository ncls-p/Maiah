import JSZip from "jszip";
import "pdf-parse/worker";

import {
AttachmentDetection,
htmlToMarkdown,
maxMarkdownTableColumns,
maxMarkdownTableRows,
} from "./attachments.chat-image-attachment";
import {
decodeXmlEntities,
markdownLanguagesByExtension,
normalizeExtractedText,
} from "./attachments.detect-attachment";

function fencedMarkdown(value: string, language = "text") {
  const longestFence = Math.max(
    2,
    ...Array.from(value.matchAll(/`+/g), (match) => match[0].length),
  );
  const fence = "`".repeat(longestFence + 1);
  return `${fence}${language}\n${value.trim()}\n${fence}`;
}

function escapeMarkdownTableCell(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br>")
    .trim();
}

function parseDelimitedRows(value: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '"') {
      if (quoted && value[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      row.push(field);
      field = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && value[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }

  row.push(field);
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

export function markdownTable(rows: string[][]) {
  if (rows.length === 0) return "";
  const columnCount = rows.reduce(
    (largest, row) => Math.max(largest, row.length),
    0,
  );
  const renderedColumnCount = Math.min(columnCount, maxMarkdownTableColumns);
  const normalizedRows = rows
    .slice(0, maxMarkdownTableRows)
    .map((row) =>
      Array.from({ length: renderedColumnCount }, (_, index) =>
        escapeMarkdownTableCell(row[index] ?? ""),
      ),
    );
  const header = normalizedRows[0];
  const separator = Array.from({ length: renderedColumnCount }, () => "---");
  const body = normalizedRows.slice(1);
  const table = [header, separator, ...body]
    .map((row) => `| ${row.join(" | ")} |`)
    .join("\n");
  const truncated =
    rows.length > maxMarkdownTableRows || columnCount > maxMarkdownTableColumns;
  return truncated
    ? `${table}\n\n> Table truncated during Markdown conversion.`
    : table;
}

export function textAttachmentToMarkdown(
  value: string,
  detection: AttachmentDetection,
) {
  const normalized = normalizeExtractedText(value);
  if (!normalized) return "";
  if (detection.extension === ".html") {
    return htmlToMarkdown.turndown(normalized);
  }
  if (detection.extension === ".csv" || detection.extension === ".tsv") {
    return markdownTable(
      parseDelimitedRows(
        normalized,
        detection.extension === ".csv" ? "," : "\t",
      ),
    );
  }
  const language = markdownLanguagesByExtension.get(detection.extension);
  return language ? fencedMarkdown(normalized, language) : normalized;
}

export function extractXmlText(xml: string) {
  const textNodes = Array.from(
    xml.matchAll(
      /<(?:[a-z0-9_-]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-z0-9_-]+:)?t>/gi,
    ),
    (match) => decodeXmlEntities(match[1].replace(/<[^>]*>/g, "")),
  );
  if (textNodes.length > 0) return textNodes.join(" ");
  return decodeXmlEntities(xml.replace(/<[^>]+>/g, " "));
}

export function zipEntryNumber(fileName: string) {
  const match = fileName.match(/(\d+)\.xml$/i);
  return match ? Number.parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

export function declaredZipUncompressedSize(entry: JSZip.JSZipObject) {
  const compressedEntry = entry as unknown as {
    _data?: { uncompressedSize?: unknown };
  };
  const size = compressedEntry._data?.uncompressedSize;
  return typeof size === "number" && Number.isFinite(size) ? size : null;
}

export function extractDocxMarkdown(xml: string) {
  const paragraphs = Array.from(
    xml.matchAll(
      /<(?:[a-z0-9_-]+:)?p(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-z0-9_-]+:)?p>/gi,
    ),
    (match) => match[1],
  );
  if (paragraphs.length === 0) return extractXmlText(xml);

  return paragraphs
    .map((paragraph) => {
      const text = normalizeExtractedText(extractXmlText(paragraph));
      if (!text) return "";
      const style = paragraph.match(
        /<(?:[a-z0-9_-]+:)?pStyle\b[^>]*(?:[a-z0-9_-]+:)?val=["']([^"']+)["']/i,
      )?.[1];
      const headingLevel = style?.match(/^Heading([1-6])$/i)?.[1];
      if (headingLevel) return `${"#".repeat(Number(headingLevel))} ${text}`;
      if (style && /^(?:Title|Subtitle)$/i.test(style)) return `# ${text}`;
      return text;
    })
    .filter(Boolean)
    .join("\n\n");
}

export function spreadsheetColumnIndex(reference: string) {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase();
  if (!letters) return 0;
  return (
    Array.from(letters).reduce(
      (value, letter) => value * 26 + letter.charCodeAt(0) - 64,
      0,
    ) - 1
  );
}

export function extractSharedStrings(xml: string) {
  return Array.from(
    xml.matchAll(
      /<(?:[a-z0-9_-]+:)?si(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-z0-9_-]+:)?si>/gi,
    ),
    (match) => normalizeExtractedText(extractXmlText(match[1])),
  );
}
