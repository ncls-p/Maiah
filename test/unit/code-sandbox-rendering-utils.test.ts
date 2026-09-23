import { describe, expect, it } from "vitest";

import {
  codeSandboxFailureSummary,
  codeSandboxFileAvailability,
  codeSandboxOutputFromUnknown,
  codeSandboxToolVisualState,
  partitionCodeSandboxFiles,
  pendingCodeSandboxInput,
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
        sandboxPart({
          input: { language: "python", code: "print(1)" },
          output: sandboxOutput([]),
        }),
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

  it("keeps generated-but-unavailable files standalone (reasons are covered by the card tests)", () => {
    for (const file of [
      {
        path: "broken.txt",
        size: 8,
        mimeType: "text/plain",
        downloadError: "object storage unavailable",
      },
      {
        path: "big.txt",
        size: 9_000_000,
        mimeType: "text/plain",
        skipped: "too_large",
      },
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

  it.each([
    [{ skipped: "too_large" }, "too_large"],
    [{ contentOmitted: "too_large" }, "too_large"],
    [{ contentOmitted: "total_limit" }, "total_limit"],
  ])(
    "preserves an unavailable file reason for the file card: %j",
    (reason, expected) => {
      const result = codeSandboxOutputFromUnknown(
        sandboxOutput([
          {
            path: "report.txt",
            size: 9_000_000,
            mimeType: "text/plain",
            ...reason,
          },
        ]),
      );

      expect(result?.files[0]).toMatchObject({ contentOmitted: expected });
      expect(result?.files[0]).not.toHaveProperty("downloadUrl");
      // Persisted conversations go through the same normalization on reload.
      expect(codeSandboxOutputFromUnknown(result)?.files).toEqual(
        result?.files,
      );
    },
  );

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
    // The standalone header must agree with the failure banner.
    expect(codeSandboxToolVisualState(parsed.output, "error")).toBe("error");
  });

  it("summarizes a failure with the last stderr line or the timeout", () => {
    const traceback = codeSandboxOutputFromUnknown({
      ...sandboxOutput([], false),
      stderr:
        'Traceback (most recent call last):\n  File "main.py", line 1\nValueError: boom\n\n',
    });
    expect(traceback && codeSandboxFailureSummary(traceback)).toEqual({
      timedOut: false,
      line: "ValueError: boom",
    });

    const timeout = codeSandboxOutputFromUnknown({
      ...sandboxOutput([], false),
      stderr: "",
      timedOut: true,
    });
    expect(timeout && codeSandboxFailureSummary(timeout)).toEqual({
      timedOut: true,
      line: null,
    });
  });

  it("gives every file without a download link an explicit availability", () => {
    const base = { path: "f.txt", size: 1, mimeType: "text/plain" };
    expect(
      codeSandboxFileAvailability({ ...base, downloadUrl: "/attachments/f" }),
    ).toEqual({ kind: "download", url: "/attachments/f" });
    expect(
      codeSandboxFileAvailability({ ...base, contentOmitted: "too_large" }),
    ).toEqual({ kind: "omitted", reason: "too_large" });
    expect(
      codeSandboxFileAvailability({ ...base, downloadError: "storage down" }),
    ).toEqual({ kind: "download_failed", detail: "storage down" });
    expect(codeSandboxFileAvailability(base)).toEqual({ kind: "unavailable" });
  });

  it("treats an input file with unknown modification state as a deliverable", () => {
    // Same rule as server-side persistence: a persisted file is never hidden.
    const files = [
      { path: "in.txt", size: 1, mimeType: "text/plain", fromInput: true },
    ];
    expect(partitionCodeSandboxFiles(files).outputFiles).toHaveLength(1);
    expect(
      toolPartHasStandaloneRendering(
        sandboxPart({ output: sandboxOutput(files) }),
      ),
    ).toBe(true);
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

  it("shows sandbox code standalone while its input is streaming", () => {
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

  it("keeps the formatted code preview for a sandbox call awaiting its result", () => {
    const input = { language: "python", code: "print(42)" };
    // After tool_call: the parsed input is available.
    expect(
      pendingCodeSandboxInput({ toolName: "run_code_sandbox", input }),
    ).toMatchObject({ language: "python", code: "print(42)" });
    // Between tool_input_end and tool_call: only the complete input text.
    expect(
      pendingCodeSandboxInput({
        toolName: "specialist_run_code_sandbox",
        inputText: JSON.stringify(input),
        streamingInput: false,
      }),
    ).toMatchObject({ language: "python", code: "print(42)" });
    // While streaming, the live input card already handles the preview.
    expect(
      pendingCodeSandboxInput({
        toolName: "run_code_sandbox",
        inputText: JSON.stringify(input),
        streamingInput: true,
      }),
    ).toBeNull();
    // With a result, or for another tool, there is nothing pending.
    expect(
      pendingCodeSandboxInput({
        toolName: "run_code_sandbox",
        input,
        output: sandboxOutput([]),
      }),
    ).toBeNull();
    expect(
      pendingCodeSandboxInput({ toolName: "web_search", input }),
    ).toBeNull();
    expect(
      pendingCodeSandboxInput({ toolName: "run_code_sandbox", input: {} }),
    ).toBeNull();
  });

  it("keeps a running top-level sandbox call standalone until its result arrives", () => {
    const running = {
      type: "tool-call",
      content: JSON.stringify({
        toolCallId: "sandbox-call",
        toolName: "run_code_sandbox",
        input: { language: "python", code: "print(1)" },
      }),
    };
    // While the message streams, the card stays put instead of jumping into
    // the trace between the end of the input and the result.
    expect(
      toolPartHasStandaloneRendering(running, { messageStreaming: true }),
    ).toBe(true);
    // A call that never produced a result on a finished message is trace-only.
    expect(toolPartHasStandaloneRendering(running)).toBe(false);
    expect(
      toolPartHasStandaloneRendering(
        {
          type: "tool-call",
          content: JSON.stringify({
            toolName: "run_code_sandbox",
            input: { language: "python", code: "print(1)" },
            denied: true,
          }),
        },
        { messageStreaming: true },
      ),
    ).toBe(false);
    // Non-sandbox tools are unaffected.
    expect(
      toolPartHasStandaloneRendering(
        {
          type: "tool-call",
          content: JSON.stringify({ toolName: "web_search", input: {} }),
        },
        { messageStreaming: true },
      ),
    ).toBe(false);
    // Once the result is in, the file rule decides.
    expect(
      toolPartHasStandaloneRendering(
        sandboxPart({ output: sandboxOutput([]) }),
        { messageStreaming: true },
      ),
    ).toBe(false);
  });

  it("surfaces a published specialist sandbox deliverable through the same rule", () => {
    const published = (files: unknown[]) => ({
      type: "tool-result",
      content: JSON.stringify({
        toolCallId: "publish-call",
        toolName: "publish_specialist_output",
        input: { visualOutputId: "00000000-0000-4000-8000-000000000001" },
        output: sandboxOutput(files),
      }),
    });

    expect(
      toolPartHasStandaloneRendering(
        published([
          {
            path: "chart.png",
            size: 120,
            mimeType: "image/png",
            downloadUrl: "/attachments/chart.png",
          },
        ]),
      ),
    ).toBe(true);
    expect(toolPartHasStandaloneRendering(published([]))).toBe(false);
  });

  it("keeps a child-agent sandbox result with files inside the specialist trace", () => {
    expect(
      toolPartHasStandaloneRendering(
        sandboxPart({
          output: sandboxOutput([
            {
              path: "chart.png",
              size: 120,
              mimeType: "image/png",
              downloadUrl: "/attachments/chart.png",
            },
          ]),
          agentContext: {
            agentId: "child-agent",
            agentName: "Data specialist",
            runId: "child-run",
            parentRunId: "root-run",
            depth: 1,
            status: "success",
          },
        }),
        { messageStreaming: true },
      ),
    ).toBe(false);
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
