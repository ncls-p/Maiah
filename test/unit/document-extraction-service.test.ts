import { beforeEach,describe,expect,it,vi } from "vitest";

const mocks = vi.hoisted(() => ({
  extractWithAnydoc: vi.fn(),
  getDefaultRagConfig: vi.fn(),
  inspectPdfVisualCandidates: vi.fn(),
  isSupportedOcrImage: vi.fn((mimeType: string) => ["image/png", "image/jpeg"].includes(mimeType)),
  runVisualOcr: vi.fn(),
  visualRegionsMarkdown: vi.fn(),
}));

vi.mock("@/modules/document-extraction/anydoc-adapter", () => ({
  extractWithAnydoc: mocks.extractWithAnydoc,
}));

vi.mock("@/modules/document-extraction/visual-ocr", () => ({
  inspectPdfVisualCandidates: mocks.inspectPdfVisualCandidates,
  isSupportedOcrImage: mocks.isSupportedOcrImage,
  runVisualOcr: mocks.runVisualOcr,
  visualRegionsMarkdown: mocks.visualRegionsMarkdown,
}));

vi.mock("@/modules/knowledge/rag-config", () => ({
  getDefaultRagConfig: mocks.getDefaultRagConfig,
}));

import { extractDocument } from "@/modules/document-extraction/service";
import { DEFAULT_RAG_CONFIG } from "@/modules/knowledge/rag-config-schema";

const ocrConfig = {
  ...DEFAULT_RAG_CONFIG,
  extraction: {
    ...DEFAULT_RAG_CONFIG.extraction,
    ocr: {
      ...DEFAULT_RAG_CONFIG.extraction.ocr,
      enabled: true,
      modelId: "qwen-vision",
      maxVisualPages: 2,
    },
  },
};

describe("document extraction orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.extractWithAnydoc.mockResolvedValue(null);
    mocks.runVisualOcr.mockResolvedValue({ regions: [], warnings: [] });
    mocks.visualRegionsMarkdown.mockReturnValue("");
  });

  it("rejects formats unsupported by both AnyDoc and visual OCR", async () => {
    await expect(
      extractDocument({
        fileName: "archive.bin",
        mimeType: "application/octet-stream",
        bytes: new Uint8Array([1]),
      }),
    ).resolves.toBeNull();
  });

  it("uses the platform default and OCRs only selected PDF pages", async () => {
    mocks.extractWithAnydoc.mockResolvedValue({
      format: "pdf",
      markdown: "Deterministic PDF text",
      imageAssets: [],
    });
    mocks.getDefaultRagConfig.mockResolvedValue(ocrConfig);
    const candidates = [
      {
        sourceKind: "page" as const,
        sourceRef: "page:2",
        mediaType: "image/png",
        data: new Uint8Array([2]),
      },
    ];
    mocks.inspectPdfVisualCandidates.mockResolvedValue(candidates);
    const regions = [
      {
        kind: "diagram" as const,
        sourceKind: "page" as const,
        sourceRef: "page:2",
        boundingBox: { x: 1, y: 2, width: 3, height: 4 },
        text: "A → B",
        description: "diagram",
        confidence: 0.9,
      },
    ];
    mocks.runVisualOcr.mockResolvedValue({ regions, warnings: ["notice"] });
    mocks.visualRegionsMarkdown.mockReturnValue("Visual Markdown");

    const result = await extractDocument({
      workspaceId: "22222222-2222-4222-8222-222222222222",
      fileName: "scan.pdf",
      mimeType: "application/pdf",
      bytes: new Uint8Array([1]),
    });

    expect(mocks.inspectPdfVisualCandidates).toHaveBeenCalledOnce();
    expect(mocks.runVisualOcr).toHaveBeenCalledWith(expect.objectContaining({ candidates }));
    expect(result).toMatchObject({
      markdown: "Deterministic PDF text\n\nVisual Markdown",
      engine: "anydoc",
      ocrApplied: true,
      warnings: ["notice"],
    });
  });

  it("OCRs only supported AnyDoc image assets up to the configured limit", async () => {
    mocks.extractWithAnydoc.mockResolvedValue({
      format: "docx",
      markdown: "Document text",
      imageAssets: [
        {
          id: "1",
          mediaType: "image/png",
          originPart: "word/media/image1.png",
          data: new Uint8Array([1]),
        },
        {
          id: "2",
          mediaType: "image/svg+xml",
          originPart: "word/media/image2.svg",
          data: new Uint8Array([2]),
        },
        {
          id: "3",
          mediaType: "image/jpeg",
          originPart: "",
          data: new Uint8Array([3]),
        },
      ],
    });

    await extractDocument({
      workspaceId: "22222222-2222-4222-8222-222222222222",
      fileName: "brief.docx",
      bytes: new Uint8Array([1]),
      config: ocrConfig,
    });

    expect(mocks.runVisualOcr).toHaveBeenCalledWith(
      expect.objectContaining({
        candidates: [expect.objectContaining({ sourceRef: "word/media/image1.png" }), expect.objectContaining({ sourceRef: "asset:3" })],
      }),
    );
  });

  it("keeps standalone image OCR disabled without workspace model context", async () => {
    const result = await extractDocument({
      fileName: "diagram.png",
      mimeType: "image/png; charset=binary",
      bytes: new Uint8Array([1]),
      config: ocrConfig,
    });

    expect(mocks.runVisualOcr).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      engine: "none",
      ocrApplied: false,
      warnings: [expect.stringContaining("workspace model context")],
    });
  });
});
