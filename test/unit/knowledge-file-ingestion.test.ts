import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { extractKnowledgeUploads } from "@/modules/knowledge/file-ingestion";

const encoder = new TextEncoder();

describe("knowledge file ingestion", () => {
  it("converts several CSV and text files into separate RAG documents", async () => {
    const result = await extractKnowledgeUploads([
      {
        fileName: "people.csv",
        mimeType: "text/csv",
        bytes: encoder.encode("name,role\nAda,Engineer"),
      },
      {
        fileName: "notes/readme.md",
        mimeType: "text/markdown",
        bytes: encoder.encode("# Notes\n\nUseful context"),
      },
    ]);

    expect(result.rejected).toEqual([]);
    expect(result.files).toHaveLength(2);
    expect(result.files[0]).toMatchObject({
      title: "people.csv",
      mimeType: "text/csv; charset=utf-8",
    });
    expect(result.files[0]?.content).toContain("| name | role |");
    expect(result.files[1]?.title).toBe("notes/readme.md");
  });

  it("expands a folder-shaped ZIP and preserves safe relative names", async () => {
    const zip = new JSZip();
    zip.file("handbook/policy.txt", "Remote work policy");
    zip.file("handbook/contacts.csv", "team,email\nIT,it@example.test");
    const bytes = await zip.generateAsync({ type: "uint8array" });

    const result = await extractKnowledgeUploads([
      { fileName: "handbook.zip", mimeType: "application/zip", bytes },
    ]);

    expect(result.rejected).toEqual([]);
    expect(result.files.map((file) => file.title)).toEqual([
      "handbook/policy.txt",
      "handbook/contacts.csv",
    ]);
  });

  it("rejects nested ZIP archives", async () => {
    const nested = new JSZip();
    nested.file("inside.txt", "content");
    const outer = new JSZip();
    outer.file(
      "nested.zip",
      await nested.generateAsync({ type: "uint8array" }),
    );

    await expect(
      extractKnowledgeUploads([
        {
          fileName: "outer.zip",
          mimeType: "application/zip",
          bytes: await outer.generateAsync({ type: "uint8array" }),
        },
      ]),
    ).rejects.toThrow("Nested ZIP archives are not supported");
  });

  it("reports unreadable and invalid files independently", async () => {
    const result = await extractKnowledgeUploads([
      {
        fileName: "unknown.bin",
        mimeType: "application/octet-stream",
        bytes: new Uint8Array([0, 1, 2]),
      },
      {
        fileName: "empty.txt",
        mimeType: "text/plain",
        bytes: new Uint8Array(),
      },
    ]);

    expect(result.files).toEqual([]);
    expect(result.rejected).toEqual([
      expect.objectContaining({ title: "unknown.bin" }),
      expect.objectContaining({
        title: "empty.txt",
        error: "Attachment file is empty.",
      }),
    ]);
  });
});
