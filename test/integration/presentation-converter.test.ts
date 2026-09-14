import "pdf-parse/worker";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import { presentationPdf } from "@/modules/document-extraction/presentation-pdf";
import { presentationVisualCandidates } from "@/modules/document-extraction/presentation-visual-candidates";

const suite = process.env.DOCUMENT_CONVERTER_URL ? describe : describe.skip;
suite("private presentation converter", () => {
  it("renders every slide in order and supplies complete slide images for OCR", async () => {
    const input = {
      fileName: "diagnostic.pptx",
      bytes: await readFile("test/fixtures/presentation-rag.pptx"),
    };
    const bytes = await presentationPdf(input);
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
    const parser = new PDFParse({ data: Buffer.from(bytes) });
    try {
      const text = await parser.getText();
      expect(text.pages).toHaveLength(2);
      expect(text.pages[0].text).toContain("Première étape");
      expect(text.pages[1].text).toContain("Deuxième étape");
    } finally {
      await parser.destroy();
    }
    const visual = await presentationVisualCandidates(input, 1);
    expect(visual.limited).toBe(true);
    expect(visual.candidates).toHaveLength(1);
    expect(visual.candidates[0].sourceRef).toBe("slide:1");
    expect(visual.candidates[0].data.byteLength).toBeGreaterThan(1000);
  }, 90_000);
  it("rejects invalid presentations without caching a failed conversion", async () => {
    await expect(
      presentationPdf({
        fileName: "broken.pptx",
        bytes: new Uint8Array([1, 2, 3]),
      }),
    ).rejects.toThrow();
  }, 90_000);
});
