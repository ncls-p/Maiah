import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { normalizeOcrCandidate } from "@/modules/document-extraction/ocr-image-normalization";

describe("OCR image normalization", () => {
  it("keeps small images unchanged", async () => {
    const candidate = {
      sourceKind: "page" as const,
      sourceRef: "page:1",
      mediaType: "image/png",
      data: new Uint8Array([1, 2, 3]),
    };

    await expect(normalizeOcrCandidate(candidate)).resolves.toBe(candidate);
  });

  it("keeps the original candidate when Sharp rejects the image", async () => {
    const candidate = {
      sourceKind: "page" as const,
      sourceRef: "page:invalid",
      mediaType: "image/png",
      data: new Uint8Array(250_000),
    };

    await expect(normalizeOcrCandidate(candidate)).resolves.toBe(candidate);
  });

  it("compresses large noisy PNG pages to JPEG", async () => {
    const width = 1_000;
    const height = 1_000;
    const pixels = Buffer.alloc(width * height * 3);
    let state = 1;
    for (let index = 0; index < pixels.length; index += 1) {
      state = (state * 1_664_525 + 1_013_904_223) >>> 0;
      pixels[index] = state >>> 24;
    }
    const png = await sharp(pixels, {
      raw: { width, height, channels: 3 },
    })
      .png()
      .toBuffer();
    const candidate = {
      sourceKind: "page" as const,
      sourceRef: "page:2",
      mediaType: "image/png",
      data: new Uint8Array(png),
    };

    const normalized = await normalizeOcrCandidate(candidate);

    expect(normalized.mediaType).toBe("image/jpeg");
    expect(normalized.data.byteLength).toBeLessThan(candidate.data.byteLength);
    await expect(sharp(normalized.data).metadata()).resolves.toMatchObject({
      format: "jpeg",
      width,
      height,
    });
  });
});
