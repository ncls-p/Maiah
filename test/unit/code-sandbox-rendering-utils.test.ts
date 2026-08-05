import { describe,expect,it } from "vitest";

import { codeSandboxOutputFromUnknown,partitionCodeSandboxFiles,summarizeToolBody,toolPartHasStandaloneRendering } from "@/components/chat/chat-message-rendering-utils";

describe("code sandbox result rendering", () => {
  it("previews a structured result instead of its object key", () => {
    expect(summarizeToolBody("deepwiki_ask_question", { result: "ServiceNow Australia is the latest release." }, false)).toBe("ServiceNow Australia is the latest release.");
  });

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

    expect(partitioned.inputFiles.map((file) => file.path)).toEqual(["attachments/report.document/pages/001-page-1.md"]);
    expect(partitioned.outputFiles.map((file) => file.path)).toEqual(["summary.md", "attachments/report.document/README.md"]);
  });

  it("keeps visual tools outside the collapsible work trace for their whole lifecycle", () => {
    for (const toolName of ["render_html_artifact", "generate_image", "run_code_sandbox", "code_workspace_write_file", "github_publish_code_workspace"]) {
      expect(
        toolPartHasStandaloneRendering({
          type: "tool-call",
          content: JSON.stringify({ toolName }),
        }),
      ).toBe(true);
    }

    expect(
      toolPartHasStandaloneRendering({
        type: "tool-call",
        content: JSON.stringify({ toolName: "web_search" }),
      }),
    ).toBe(false);
  });
});
