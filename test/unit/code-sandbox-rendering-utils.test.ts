import { describe, expect, it } from "vitest";

import {
  codeSandboxOutputFromUnknown,
  partitionCodeSandboxFiles,
} from "@/components/chat/chat-message-rendering-utils";

describe("code sandbox result rendering", () => {
  it("keeps input provenance while normalizing a sandbox result", () => {
    const result = codeSandboxOutputFromUnknown({
      kind: "code_sandbox_result",
      ok: true,
      language: "python",
      files: [
        {
          path: "attachments/report.document/pages/001-page-1.md",
          size: 1200,
          mimeType: "text/markdown",
          fromInput: true,
          modified: false,
        },
      ],
    });

    expect(result?.files[0]).toMatchObject({
      fromInput: true,
      modified: false,
    });
  });

  it("separates unchanged inputs from created or modified files", () => {
    const files = [
      {
        path: "attachments/report.document/pages/001-page-1.md",
        size: 1200,
        mimeType: "text/markdown",
        fromInput: true,
        modified: false,
      },
      {
        path: "summary.md",
        size: 420,
        mimeType: "text/markdown",
      },
      {
        path: "attachments/report.document/README.md",
        size: 700,
        mimeType: "text/markdown",
        fromInput: true,
        modified: true,
      },
    ];

    const partitioned = partitionCodeSandboxFiles(files);

    expect(partitioned.inputFiles.map((file) => file.path)).toEqual([
      "attachments/report.document/pages/001-page-1.md",
    ]);
    expect(partitioned.outputFiles.map((file) => file.path)).toEqual([
      "summary.md",
      "attachments/report.document/README.md",
    ]);
  });
});
