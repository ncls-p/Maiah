import { describe, expect, it } from "vitest";

import {
  createPastedTextUploadFile,
  shouldUploadPastedText,
} from "@/components/chat/chat-composer-paste";
import { detectAttachment } from "@/modules/chat/attachments.detect-attachment";

describe("chat upload policy", () => {
  it("turns pasted text into a txt upload only above 1,000 characters", async () => {
    expect(shouldUploadPastedText("a".repeat(1_000))).toBe(false);
    expect(shouldUploadPastedText("a".repeat(1_001))).toBe(true);

    const content = "incident log\n".repeat(100);
    const file = createPastedTextUploadFile(
      content,
      new Date("2026-08-16T05:00:00.000Z"),
    );
    expect(file.name).toBe("pasted-text-2026-08-16T05-00-00-000Z.txt");
    expect(file.type).toBe("text/plain");
    expect(await file.text()).toBe(content);
  });

  it("recognizes log files as readable text attachments", () => {
    expect(
      detectAttachment({
        fileName: "service.log",
        declaredMimeType: "application/octet-stream",
        bytes: new TextEncoder().encode("INFO server ready\n"),
      }),
    ).toMatchObject({
      category: "text",
      extension: ".log",
      textKind: "text",
    });
  });
});
