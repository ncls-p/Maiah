import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import { presentationPdf } from "./presentation-pdf";
import type { DocumentExtractionInput, VisualCandidate } from "./types";

/** Render complete slides: SmartArt, grouped shapes and charts are not image assets. */
export async function presentationVisualCandidates(
  input: DocumentExtractionInput,
  maxPages: number,
) {
  const bytes = await presentationPdf(input);
  const parser = new PDFParse({ data: Buffer.from(bytes) });
  const candidates: VisualCandidate[] = [];
  let totalBytes = 0;
  let totalPages = 0;
  try {
    for (let first = 1; first <= maxPages; first += 5) {
      const screenshots = await parser.getScreenshot({
        partial: Array.from(
          { length: Math.min(5, maxPages - first + 1) },
          (_, i) => first + i,
        ),
        desiredWidth: 1600,
        imageBuffer: true,
        imageDataUrl: false,
      });
      totalPages = screenshots.total;
      for (const page of screenshots.pages) {
        totalBytes += page.data.byteLength;
        if (totalBytes > 64 * 1024 * 1024) {
          return { candidates, limited: true };
        }
        candidates.push({
          sourceKind: "page",
          sourceRef: `slide:${page.pageNumber}`,
          mediaType: "image/png",
          data: page.data,
        });
      }
      if (first + 4 >= totalPages) break;
    }
    return { candidates, limited: candidates.length < totalPages };
  } finally {
    await parser.destroy();
  }
}
