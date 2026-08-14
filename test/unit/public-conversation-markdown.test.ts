import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("public shared conversation", () => {
  it("renders message parts with the chat markdown renderer", () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/app/[locale]/share/[publicShareId]/public-conversation.tsx",
      ),
      "utf8",
    );

    expect(source).toContain('from "@/components/chat/chat-markdown"');
    expect(source).toContain("ChatMarkdown");
    expect(source).toContain("{part.content}");
    expect(source).not.toContain("whitespace-pre-wrap break-words");
  });
});
