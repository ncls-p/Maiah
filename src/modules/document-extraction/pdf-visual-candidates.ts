import "pdf-parse/worker";

import { PDFParse } from "pdf-parse";

import { logger } from "@/lib/logger";
import type { VisualCandidate } from "@/modules/document-extraction/types";

const MIN_FULL_PAGE_SCAN_EDGE = 600;
const MIN_FULL_PAGE_SCAN_PIXELS = 1_000_000;

function isLikelyFullPageScan(image: { width: number; height: number }) {
  return (
    Math.min(image.width, image.height) >= MIN_FULL_PAGE_SCAN_EDGE &&
    image.width * image.height >= MIN_FULL_PAGE_SCAN_PIXELS
  );
}

export async function inspectPdfVisualCandidates(input: {
  bytes: Uint8Array;
  minimumTextCharactersPerPage: number;
  maxVisualPages: number;
}) {
  const startedAt = Date.now();
  const parser = new PDFParse({ data: Buffer.from(input.bytes) });
  try {
    // PDFParse shares one worker-backed document between operations. Keep these
    // calls serial to avoid transferring the same PDF object concurrently.
    const text = await parser.getText({ first: 500 });
    const images = await parser.getImage({
      first: 500,
      imageThreshold: 120,
      imageBuffer: true,
      imageDataUrl: false,
    });
    const lowTextPages = new Set(
      text.pages
        .filter(
          (page) =>
            page.text.replace(/\s/g, "").length <
            input.minimumTextCharactersPerPage,
        )
        .map((page) => page.num),
    );
    const fullPageScans: VisualCandidate[] = [];
    const assetCandidates: VisualCandidate[] = [];
    const scanPages = new Set<number>();

    for (const page of images.pages) {
      const fullPageImage =
        lowTextPages.has(page.pageNumber) && page.images.length === 1
          ? page.images.find(isLikelyFullPageScan)
          : undefined;
      if (fullPageImage) {
        scanPages.add(page.pageNumber);
        fullPageScans.push({
          sourceKind: "page",
          sourceRef: `page:${page.pageNumber}/image:${fullPageImage.name}`,
          mediaType: "image/png",
          data: fullPageImage.data,
        });
        continue;
      }
      if (lowTextPages.has(page.pageNumber)) continue;
      for (const image of page.images) {
        assetCandidates.push({
          sourceKind: "asset",
          sourceRef: `page:${page.pageNumber}/image:${image.name}`,
          mediaType: "image/png",
          data: image.data,
        });
      }
    }

    const screenshotPages = [...lowTextPages].filter(
      (pageNumber) => !scanPages.has(pageNumber),
    );
    const pageSlots = Math.max(0, input.maxVisualPages - fullPageScans.length);
    const selectedScreenshotPages = screenshotPages.slice(0, pageSlots);
    const screenshots =
      selectedScreenshotPages.length > 0
        ? await parser.getScreenshot({
            partial: selectedScreenshotPages,
            desiredWidth: 1600,
            imageBuffer: true,
            imageDataUrl: false,
          })
        : { pages: [] };
    const screenshotCandidates = screenshots.pages.map(
      (page): VisualCandidate => ({
        sourceKind: "page",
        sourceRef: `page:${page.pageNumber}`,
        mediaType: "image/png",
        data: page.data,
      }),
    );
    const candidates = [
      ...fullPageScans,
      ...screenshotCandidates,
      ...assetCandidates,
    ].slice(0, input.maxVisualPages);

    logger.info("PDF visual candidate inspection completed", {
      pdfBytes: input.bytes.byteLength,
      inspectedPageCount: text.pages.length,
      lowTextPageCount: lowTextPages.size,
      fullPageScanCount: fullPageScans.length,
      screenshotPageCount: screenshotCandidates.length,
      assetImageCount: assetCandidates.length,
      selectedPageCount: candidates.length,
      selectedScreenshotPages,
      renderedBytes: candidates.reduce(
        (total, candidate) => total + candidate.data.byteLength,
        0,
      ),
      durationMs: Date.now() - startedAt,
    });
    return candidates;
  } finally {
    await parser.destroy();
  }
}
