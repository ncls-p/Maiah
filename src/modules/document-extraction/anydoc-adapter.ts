import path from "node:path";

import {
  formatFromBytes,
  formatFromExtension,
  toDocument,
  toMarkdownBytes,
  type Asset,
  type Format,
} from "@firecrawl/anydoc";

export type AnydocExtraction = {
  markdown: string;
  format: Format;
  imageAssets: Array<Pick<Asset, "id" | "mediaType" | "originPart" | "data">>;
};

function normalizeAnydocMarkdown(markdown: string, format: Format) {
  if (format !== "csv") return markdown;
  // AnyDoc currently emits an empty synthetic header row for some CSV files.
  // Promote the first data row to the header while keeping its separator.
  const lines = markdown.split("\n");
  const emptyHeader = /^\|(?:\s*\|)+\s*$/.test(lines[0] ?? "");
  const separator = /^\|(?:\s*-+\s*\|)+\s*$/.test(lines[1] ?? "");
  if (emptyHeader && separator && lines[2]) {
    return [lines[2], lines[1], ...lines.slice(3)].join("\n");
  }
  return markdown;
}

function detectAnydocFormat(fileName: string, bytes: Uint8Array) {
  return (
    formatFromBytes(bytes) ??
    formatFromExtension(path.extname(fileName).toLowerCase())
  );
}

export async function extractWithAnydoc(
  fileName: string,
  bytes: Uint8Array,
): Promise<AnydocExtraction | null> {
  const format = detectAnydocFormat(fileName, bytes);
  if (!format) return null;

  let markdown = "";
  try {
    markdown = normalizeAnydocMarkdown(
      await toMarkdownBytes(bytes, format),
      format,
    );
  } catch (error) {
    // Image-only PDFs are explicitly unsupported by AnyDoc. They continue to
    // the coordinate-aware visual path instead of failing the whole upload.
    if (format !== "pdf") throw error;
  }

  if (format === "pdf") {
    return { markdown, format, imageAssets: [] };
  }

  const document = await toDocument(bytes, format);
  return {
    markdown,
    format,
    imageAssets: document.assets.filter((asset) =>
      asset.mediaType.toLowerCase().startsWith("image/"),
    ),
  };
}
