import { describe, expect, it } from "vitest";

import {
  codeSandboxOutputFromUnknown,
  codeSandboxToolVisualState,
  partitionCodeSandboxFiles,
  summarizeToolBody,
  toolPartHasStandaloneRendering,
} from "@/components/chat/chat-message-rendering-utils";
import {
  parseToolPart,
  renderablePartsFromMessage,
  type ChatMessage,
} from "@/components/chat/chat-types";

function sandboxPart(content: Record<string, unknown>) {
  return {
    type: "tool-result",
    content: JSON.stringify({
      toolCallId: "sandbox-call",
      toolName: "run_code_sandbox",
      ...content,
    }),
  };
}

function sandboxOutput(files: unknown[], ok = true) {
  return {
    kind: "code_sandbox_result",
    ok,
    language: "python",
    exitCode: ok ? 0 : 1,
    timedOut: false,
    durationMs: 10,
    stdout: "",
    stderr: ok ? "" : "Traceback (most recent call last):",
    files,
  };
}

describe("code sandbox result rendering", () => {
  it("previews a structured result instead of its object key", () => {
    expect(
      summarizeToolBody(
        "deepwiki_ask_question",
        { result: "ServiceNow Australia is the latest release." },
        false,
      ),
    ).toBe("ServiceNow Australia is the latest release.");
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
      { path: "summary.md", size: 420, mimeType: "text/markdown" },
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

  it("keeps code execution failures visually neutral at the tool level", () => {
    const failedExecution = {
      kind: "code_sandbox_result",
      ok: false,
      language: "python",
      exitCode: 1,
      timedOut: false,
      durationMs: 12,
      stdout: "",
      stderr: "SyntaxError",
      files: [],
    };

    expect(codeSandboxToolVisualState(failedExecution, "error")).toBe(
      "completed",
    );
    expect(
      codeSandboxToolVisualState({ error: "Sandbox unavailable" }, "error"),
    ).toBe("error");
  });

  it("keeps visual tools outside the collapsible work trace for their whole lifecycle", () => {
    for (const toolName of [
      "render_html_artifact",
      "generate_image",
      "code_workspace_write_file",
      "github_publish_code_workspace",
    ]) {
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

  it("shows generated files standalone without any visibility flag", () => {
    expect(
      toolPartHasStandaloneRendering(
        sandboxPart({ input: { language: "python", code: "print(1)" } }),
      ),
    ).toBe(false);

    expect(
      toolPartHasStandaloneRendering(
        sandboxPart({ input: { language: "python", code: "print(1)" }, output: sandboxOutput([]) }),
      ),
    ).toBe(false);

    expect(
      toolPartHasStandaloneRendering(
        sandboxPart({
          input: { language: "python", code: "print(1)" },
          output: sandboxOutput([
            {
              path: "report.txt",
              size: 8,
              mimeType: "text/plain",
              downloadUrl: "/attachments/report.txt",
            },
          ]),
        }),
      ),
    ).toBe(true);
  });

  it("keeps legacy showToUser calls readable without blocking files", () => {
    expect(
      toolPartHasStandaloneRendering(
        sandboxPart({
          input: {
            language: "python",
            code: "print(1)",
            showToUser: false,
          },
          output: sandboxOutput([
            { path: "report.txt", size: 8, mimeType: "text/plain" },
          ]),
        }),
      ),
    ).toBe(true);

    expect(
      toolPartHasStandaloneRendering(
        sandboxPart({
          input: {
            language: "python",
            code: "print(1)",
            showToUser: true,
          },
          output: sandboxOutput([]),
        }),
      ),
    ).toBe(false);
  });

  it("separates unchanged inputs from deliverables for visibility", () => {
    expect(
      toolPartHasStandaloneRendering(
        sandboxPart({
          output: sandboxOutput([
            {
              path: "data.bin",
              size: 3,
              mimeType: "application/octet-stream",
              fromInput: true,
              modified: false,
            },
          ]),
        }),
      ),
    ).toBe(false);

    expect(
      toolPartHasStandaloneRendering(
        sandboxPart({
          output: sandboxOutput([
            {
              path: "data.bin",
              size: 3,
              mimeType: "application/octet-stream",
              fromInput: true,
              modified: true,
            },
          ]),
        }),
      ),
    ).toBe(true);

    expect(
      toolPartHasStandaloneRendering(
        sandboxPart({
          output: sandboxOutput([
            { path: "a.txt", size: 1, mimeType: "text/plain" },
            { path: "b.txt", size: 1, mimeType: "text/plain" },
          ]),
        }),
      ),
    ).toBe(true);
  });

  it("shows generated-but-unavailable files with an explicit state", () => {
    for (const file of [
      {
        path: "broken.txt",
        size: 8,
        mimeType: "text/plain",
        downloadError: "object storage unavailable",
      },
      { path: "big.txt", size: 9_000_000, mimeType: "text/plain", skipped: "too_large" },
      {
        path: "omitted.txt",
        size: 40,
        mimeType: "text/plain",
        contentOmitted: "total_limit",
      },
    ]) {
      expect(
        toolPartHasStandaloneRendering(
          sandboxPart({ output: sandboxOutput([file]) }),
        ),
      ).toBe(true);
    }
  });

  it("keeps failed runs with persisted files visible without hiding the failure", () => {
    const part = sandboxPart({
      output: sandboxOutput(
        [
          {
            path: "report.txt",
            size: 8,
            mimeType: "text/plain",
            downloadUrl: "/attachments/report.txt",
          },
        ],
        false,
      ),
    });

    expect(toolPartHasStandaloneRendering(part)).toBe(true);
    const parsed = parseToolPart(part.content);
    expect(codeSandboxOutputFromUnknown(parsed.output)?.ok).toBe(false);
    expect(codeSandboxToolVisualState(parsed.output, "error")).toBe(
      "completed",
    );
  });

  it("merges persisted tool-call and tool-result parts into one renderable part", () => {
    const message: ChatMessage = {
      id: "message-1",
      role: "assistant",
      status: "completed",
      parts: [
        {
          type: "tool-call",
          content: JSON.stringify({
            toolCallId: "sandbox-call",
            toolName: "run_code_sandbox",
            input: { language: "python", code: "print(1)" },
          }),
        },
        {
          type: "tool-result",
          content: JSON.stringify({
            toolCallId: "sandbox-call",
            toolName: "run_code_sandbox",
            output: sandboxOutput([
              {
                path: "report.txt",
                size: 8,
                mimeType: "text/plain",
                downloadUrl: "/attachments/report.txt",
              },
            ]),
          }),
        },
      ],
    };

    const parts = renderablePartsFromMessage(message);
    const toolParts = parts.filter(
      (part) => part.type === "tool-call" || part.type === "tool-result",
    );

    expect(toolParts).toHaveLength(1);
    expect(toolPartHasStandaloneRendering(toolParts[0])).toBe(true);
  });

  it("shows sandbox code while streaming before the final visibility flag", () => {
    for (const toolName of [
      "run_code_sandbox",
      "specialist_run_code_sandbox",
    ]) {
      expect(
        toolPartHasStandaloneRendering({
          type: "tool-call",
          content: JSON.stringify({
            toolName,
            streamingInput: true,
            inputText: '{"language":"python","code":"print(',
          }),
        }),
      ).toBe(true);
    }
  });

  it("keeps every child-agent visual tool inside the specialist trace", () => {
    for (const toolName of [
      "run_code_sandbox",
      "render_html_artifact",
      "generate_image",
      "code_workspace_write_file",
    ]) {
      expect(
        toolPartHasStandaloneRendering({
          type: "tool-call",
          content: JSON.stringify({
            toolName,
            agentContext: {
              agentId: "child-agent",
              agentName: "Research specialist",
              runId: "child-run",
              parentRunId: "root-run",
              depth: 1,
              status: "success",
            },
          }),
        }),
      ).toBe(false);
    }
  });
});
