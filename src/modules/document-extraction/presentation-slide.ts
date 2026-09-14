import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";

let activeRenders = 0;

/** Browser-independent preview; only the requested slide is rasterized. */
export async function renderPresentationSlide(bytes: Uint8Array, page: number) {
  if (!Number.isInteger(page) || page < 1 || page > 10_000)
    throw new RangeError("Invalid slide number");
  if (activeRenders >= 2)
    throw new Error("Slide renderer is busy; please retry");
  activeRenders += 1;
  const parser = new PDFParse({ data: Buffer.from(bytes) });
  try {
    const info = await parser.getInfo({ partial: [page], parsePageInfo: true });
    const dimensions = info.pages[0];
    if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0)
      throw new RangeError("Slide not found");
    const width = Math.max(
      1,
      Math.floor(Math.min(1600, (1600 * dimensions.width) / dimensions.height)),
    );
    const result = await parser.getScreenshot({
      partial: [page],
      desiredWidth: width,
      imageBuffer: true,
      imageDataUrl: false,
    });
    const slide = result.pages[0];
    if (!slide) throw new RangeError("Slide not found");
    return { bytes: slide.data, total: result.total };
  } finally {
    try {
      await parser.destroy();
    } finally {
      activeRenders -= 1;
    }
  }
}
