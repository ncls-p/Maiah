import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { extractKnowledgeUploads } from "@/modules/knowledge/file-ingestion";
import { presentationExtension } from "@/modules/document-extraction/presentation-format";

describe("PowerPoint knowledge extraction", () => {
  it("preserves presentation order, table values, Unicode and speaker notes", async () => {
    const bytes = await readFile("test/fixtures/presentation-rag.pptx");
    const { files, rejected } = await extractKnowledgeUploads([
      { fileName: "diagnostic.pptx", bytes },
    ]);
    expect(rejected).toEqual([]);
    expect(files).toHaveLength(1);
    const text = files[0].content;
    expect(text.indexOf("Première étape")).toBeLessThan(
      text.indexOf("Deuxième étape"),
    );
    expect(text).toContain("120 kWh");
    expect(text).toContain("80 kWh");
    expect(text).toContain("vérifier la validation qualité");
  });
  it("recognizes renamed presentations from the stored MIME type", () => {
    expect(
      presentationExtension(
        "Diagnostic",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ),
    ).toBe("pptx");
    expect(
      presentationExtension("legacy", "application/vnd.ms-powerpoint"),
    ).toBe("ppt");
    expect(presentationExtension("slides.PPTX")).toBe("pptx");
    expect(presentationExtension("report.pdf", "application/pdf")).toBeNull();
  });
});
