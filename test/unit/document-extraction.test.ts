import { describe,expect,it } from "vitest";

import { extractDocument } from "@/modules/document-extraction/service";
import { visualRegionsMarkdown } from "@/modules/document-extraction/visual-ocr";
import { DEFAULT_RAG_CONFIG } from "@/modules/knowledge/rag-config-schema";

describe("shared document extraction", () => {
  it("uses AnyDoc for deterministic CSV table extraction without OCR", async () => {
    const result = await extractDocument({
      fileName: "people.csv",
      mimeType: "text/csv",
      bytes: new TextEncoder().encode("name,role\nAda,Engineer"),
      config: DEFAULT_RAG_CONFIG,
    });

    expect(result?.engine).toBe("anydoc");
    expect(result?.ocrApplied).toBe(false);
    expect(result?.markdown).toContain("| name | role |");
    expect(result?.markdown).toContain("| Ada | Engineer |");
  });

  it("does not call visual extraction for images when OCR is disabled", async () => {
    const result = await extractDocument({
      fileName: "diagram.png",
      mimeType: "image/png",
      bytes: new Uint8Array([137, 80, 78, 71]),
      config: DEFAULT_RAG_CONFIG,
    });

    expect(result).toEqual({
      markdown: "",
      engine: "none",
      visualRegions: [],
      ocrApplied: false,
      warnings: [],
    });
  });

  it("preserves region provenance and normalized coordinates", () => {
    const markdown = visualRegionsMarkdown([
      {
        kind: "diagram",
        sourceKind: "page",
        sourceRef: "page:3",
        boundingBox: { x: 120, y: 80, width: 700, height: 420 },
        text: "Service A → Service B",
        description: "A directed service dependency.",
        confidence: 0.94,
      },
    ]);

    expect(markdown).toContain("page:3 · diagram");
    expect(markdown).toContain("x=120, y=80, width=700, height=420");
    expect(markdown).toContain("Service A → Service B");
  });
});
