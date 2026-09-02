import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { zipContainsCodeWorkspace } from "@/components/chat/chat-composer.zip-upload-kind";

async function zipBlob(files: Record<string, string>) {
  const archive = new JSZip();
  for (const [fileName, content] of Object.entries(files)) {
    archive.file(fileName, content);
  }
  return new Blob([await archive.generateAsync({ type: "arraybuffer" })], {
    type: "application/zip",
  });
}

describe("chat ZIP upload routing", () => {
  it("routes TypeScript source archives to a code workspace", async () => {
    const archive = await zipBlob({
      "entrypoints/content.tsx": "export const Content = () => <main />;",
      "src/background.ts": "export {};",
    });

    await expect(zipContainsCodeWorkspace(archive)).resolves.toBe(true);
  });

  it("keeps generic archives as regular chat attachments", async () => {
    const archive = await zipBlob({
      "documents/report.pdf": "not real pdf bytes",
      "documents/notes.txt": "Notes",
    });

    await expect(zipContainsCodeWorkspace(archive)).resolves.toBe(false);
    await expect(
      zipContainsCodeWorkspace(new Blob(["not a zip"])),
    ).resolves.toBe(false);
  });
});
