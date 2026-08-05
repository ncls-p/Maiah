
import {
DocumentExplorerUnit,
maxDocumentExplorerChunkChars,
minDocumentExplorerChunkChars,
} from "./code-sandbox.failed-sandbox-result";

function markdownHeadingUnits(markdown: string): DocumentExplorerUnit[] {
  const headings = Array.from(markdown.matchAll(/^#{1,3}\s+(.+)$/gm));
  if (headings.length === 0) {
    return [{ title: "Document", text: markdown }];
  }

  const units: DocumentExplorerUnit[] = [];
  const preamble = markdown.slice(0, headings[0].index).trim();
  if (preamble) units.push({ title: "Overview", text: preamble });
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const start = heading.index;
    const end = headings[index + 1]?.index ?? markdown.length;
    const title = heading[1].trim();
    const pageMatch = title.match(/^Page\s+(\d+)$/i);
    units.push({
      title,
      text: markdown.slice(start, end).trim(),
      ...(pageMatch ? { page: Number.parseInt(pageMatch[1], 10) } : {}),
    });
  }
  return units;
}

function splitDocumentUnit(
  unit: DocumentExplorerUnit,
  targetChars: number,
): DocumentExplorerUnit[] {
  if (unit.text.length <= targetChars) return [unit];
  const parts: DocumentExplorerUnit[] = [];
  let remaining = unit.text;
  let part = 1;
  while (remaining.length > 0) {
    let end = Math.min(targetChars, remaining.length);
    if (end < remaining.length) {
      const paragraphBoundary = remaining.lastIndexOf("\n\n", end);
      const lineBoundary = remaining.lastIndexOf("\n", end);
      const boundary = Math.max(paragraphBoundary, lineBoundary);
      if (boundary >= Math.floor(targetChars * 0.6)) end = boundary;
    }
    const text = remaining.slice(0, end).trim();
    if (text) {
      parts.push({
        ...unit,
        title: `${unit.title} - part ${part}`,
        text,
      });
      part += 1;
    }
    remaining = remaining.slice(Math.max(end, 1)).trimStart();
  }
  return parts;
}

export function groupDocumentUnits(
  markdown: string,
  maxChunks: number,
): { groups: DocumentExplorerUnit[][]; complete: boolean } {
  const independentlyBrowsableUnits = markdownHeadingUnits(markdown).flatMap(
    (unit) => splitDocumentUnit(unit, maxDocumentExplorerChunkChars),
  );
  if (independentlyBrowsableUnits.length <= maxChunks) {
    return {
      groups: independentlyBrowsableUnits.map((unit) => [unit]),
      complete: true,
    };
  }

  const targetChars = Math.min(
    maxDocumentExplorerChunkChars,
    Math.max(
      minDocumentExplorerChunkChars,
      Math.ceil((markdown.length * 1.15) / Math.max(maxChunks, 1)),
    ),
  );
  const units = markdownHeadingUnits(markdown).flatMap((unit) =>
    splitDocumentUnit(unit, targetChars),
  );
  const groups: DocumentExplorerUnit[][] = [];
  let current: DocumentExplorerUnit[] = [];
  let currentChars = 0;
  let complete = true;

  for (const unit of units) {
    if (current.length > 0 && currentChars + unit.text.length > targetChars) {
      groups.push(current);
      current = [];
      currentChars = 0;
      if (groups.length >= maxChunks) {
        complete = false;
        break;
      }
    }
    current.push(unit);
    currentChars += unit.text.length;
  }
  if (current.length > 0 && groups.length < maxChunks) groups.push(current);
  if (groups.flat().length < units.length) complete = false;
  return { groups, complete };
}

export function safeDocumentChunkSlug(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 54) || "section"
  );
}

export function groupTitle(group: DocumentExplorerUnit[]) {
  const first = group[0];
  const last = group.at(-1) ?? first;
  if (group.length === 1) return first.title;
  if (first.page !== undefined && last.page !== undefined) {
    return `Pages ${first.page}-${last.page}`;
  }
  return `${first.title} to ${last.title}`;
}

export function utf8Prefix(value: string, maxBytes: number) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.byteLength <= maxBytes) return value;
  return bytes
    .subarray(0, Math.max(0, maxBytes))
    .toString("utf8")
    .replace(/\uFFFD$/, "");
}
