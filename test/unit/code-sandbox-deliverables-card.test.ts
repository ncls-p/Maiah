import { NextIntlClientProvider } from "next-intl";
import { createElement, type ComponentProps, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import en from "../../messages/en.json";
import {
  CodeSandboxResultCard,
  SandboxDeliverablesCard,
} from "@/components/chat/chat-artifact-renderers";
import { ToolPartCard } from "@/components/chat/chat-message-rendering.tool-part-card";
import {
  codeSandboxOutputFromUnknown,
  type CodeSandboxOutput,
} from "@/components/chat/chat-message-rendering-utils";
import type {
  ChatMessage,
  ChatStreamEvent,
} from "@/components/chat/chat-types";
import { applyStreamEvent } from "@/hooks/use-chat-stream-events";

function render(element: ReactElement) {
  const providerProps: ComponentProps<typeof NextIntlClientProvider> = {
    locale: "en",
    messages: en,
    timeZone: "UTC",
    children: element,
  };
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, providerProps),
  );
}

function result(
  files: unknown[],
  overrides: Partial<CodeSandboxOutput> = {},
): CodeSandboxOutput {
  const normalized = codeSandboxOutputFromUnknown({
    kind: "code_sandbox_result",
    ok: true,
    language: "python",
    exitCode: 0,
    timedOut: false,
    durationMs: 12,
    stdout: "42",
    stderr: "",
    files,
    ...overrides,
  });
  if (!normalized) throw new Error("invalid sandbox output");
  return normalized;
}

const downloadable = {
  path: "report.txt",
  size: 6,
  mimeType: "text/plain",
  downloadUrl: "/attachments/report.txt",
};

describe("SandboxDeliverablesCard", () => {
  it("renders one download link per deliverable, named after the file", () => {
    const html = render(
      createElement(SandboxDeliverablesCard, {
        result: result([
          downloadable,
          {
            path: "chart.csv",
            size: 3,
            mimeType: "text/csv",
            downloadUrl: "/attachments/chart.csv",
          },
          {
            path: "input.txt",
            size: 3,
            mimeType: "text/plain",
            fromInput: true,
            modified: false,
          },
        ]),
      }),
    );

    expect(html).toContain('aria-label="Download report.txt"');
    expect(html).toContain('href="/attachments/report.txt"');
    expect(html).toContain('aria-label="Download chart.csv"');
    // Unchanged inputs are not presented as deliverables.
    expect(html).not.toContain("input.txt");
    expect(html).toContain("2 created or modified files");
    expect(html).not.toContain("Execution failed");
  });

  it("gives every unavailable file an explicit reason and no link", () => {
    const html = render(
      createElement(SandboxDeliverablesCard, {
        result: result([
          {
            path: "big.txt",
            size: 9,
            mimeType: "text/plain",
            skipped: "too_large",
          },
          {
            path: "omitted.txt",
            size: 9,
            mimeType: "text/plain",
            contentOmitted: "total_limit",
          },
          {
            path: "broken.txt",
            size: 9,
            mimeType: "text/plain",
            downloadError: "S3 PutObject 503 at bucket internal-xyz",
          },
          { path: "orphan.txt", size: 9, mimeType: "text/plain" },
        ]),
      }),
    );

    expect(html).not.toContain("<a ");
    expect(html).toContain("File too large to attach");
    expect(html).toContain("Sandbox attachment limit reached");
    expect(html).toContain("This file could not be saved for download");
    expect(html).toContain("Not available for download");
    // The raw storage error is only kept as a hover detail.
    expect(html).toContain('title="S3 PutObject 503 at bucket internal-xyz"');
    expect(html).not.toContain(">S3 PutObject 503 at bucket internal-xyz<");
  });

  it("keeps files of a failed run and announces the last stderr line", () => {
    const html = render(
      createElement(SandboxDeliverablesCard, {
        result: result([downloadable], {
          ok: false,
          exitCode: 1,
          stderr:
            'Traceback (most recent call last):\n  File "main.py", line 1\nValueError: boom\n',
        }),
      }),
    );

    expect(html).toContain('role="status"');
    expect(html).toContain("Execution failed");
    expect(html).toContain('title="ValueError: boom"');
    expect(html).not.toContain("Traceback (most recent call last):");
    expect(html).toContain('aria-label="Download report.txt"');
  });

  it("labels a timed-out run explicitly", () => {
    const html = render(
      createElement(SandboxDeliverablesCard, {
        result: result([downloadable], {
          ok: false,
          exitCode: null,
          timedOut: true,
          stderr: "",
        }),
      }),
    );

    expect(html).toContain("Execution timed out");
  });
});

describe("CodeSandboxResultCard filesHidden", () => {
  it("hides deliverables but keeps stdout and unchanged inputs in the details", () => {
    const html = render(
      createElement(CodeSandboxResultCard, {
        result: result([
          downloadable,
          {
            path: "input.txt",
            size: 3,
            mimeType: "text/plain",
            fromInput: true,
            modified: false,
          },
        ]),
        embedded: true,
        filesHidden: true,
      }),
    );

    expect(html).not.toContain("report.txt");
    expect(html).toContain("1 available input file");
    expect(html).toContain("42");
  });
});

function sandboxToolPart(output: unknown) {
  return {
    type: "tool-call" as const,
    content: JSON.stringify({
      toolCallId: "sandbox-call",
      toolName: "run_code_sandbox",
      input: { language: "python", code: "print(42)", stdin: "hello-stdin" },
      output,
    }),
  };
}

describe("ToolPartCard sandbox deliverables", () => {
  it("marks a failed run with files as failed and keeps the raw input", () => {
    const html = render(
      createElement(ToolPartCard, {
        part: sandboxToolPart(
          result([downloadable], {
            ok: false,
            exitCode: 1,
            stderr: "ValueError: boom",
          }),
        ),
        sequence: 1,
        messageStatus: "completed",
      }),
    );

    // Header status label plus the "Failed" pill inside the details.
    expect(html.match(/>Failed</g)).toHaveLength(2);
    expect(html).not.toContain(">Completed<");
    expect(html).toContain("Execution failed");
    // Raw input (stdin included) stays available in the action details.
    expect(html).toContain("hello-stdin");
    // The deliverable appears once: outside the details only.
    expect(html.match(/Download report\.txt/g)).toHaveLength(1);
  });

  it("marks a successful run with files as completed", () => {
    const html = render(
      createElement(ToolPartCard, {
        part: sandboxToolPart(result([downloadable])),
        sequence: 1,
        messageStatus: "completed",
      }),
    );

    expect(html).toContain(">Completed<");
    expect(html).not.toContain("Execution failed");
  });
});

const sandboxCallInput = { language: "python", code: "print(4242)" };

function pendingSandboxCall(extra: Record<string, unknown> = {}) {
  return {
    type: "tool-call" as const,
    content: JSON.stringify({
      toolCallId: "sandbox-call",
      toolName: "run_code_sandbox",
      input: sandboxCallInput,
      ...extra,
    }),
  };
}

// The formatted preview is the live input card's header plus a <pre> of code;
// the raw JSON payload only lives in the collapsed action details.
function previewSection(html: string) {
  return html.split("<details")[0];
}

describe("ToolPartCard pending sandbox call", () => {
  it("keeps the formatted code preview while the call executes", () => {
    const html = render(
      createElement(ToolPartCard, {
        part: pendingSandboxCall(),
        sequence: 1,
        messageStatus: "streaming",
      }),
    );
    const preview = previewSection(html);

    expect(preview).toContain("Running python code…");
    expect(preview).toContain("print(4242)");
    expect(preview).not.toContain("&quot;language&quot;");
  });

  it("keeps the code preview and the approval controls while awaiting approval", () => {
    const onApprove = vi.fn();
    const html = render(
      createElement(ToolPartCard, {
        part: pendingSandboxCall(),
        sequence: 1,
        messageStatus: "streaming",
        approval: {
          invocationId: "invocation-1",
          toolName: "run_code_sandbox",
          input: sandboxCallInput,
        },
        onApprove,
      }),
    );
    const preview = previewSection(html);

    expect(preview).toContain("python code awaiting approval");
    expect(preview).toContain("print(4242)");
    expect(preview).toContain("Approval required");
    expect(preview).toContain(">Approve<");
    expect(preview).toContain(">Reject<");
  });

  it("falls back to the plain trace card once the message is over without a result", () => {
    const html = render(
      createElement(ToolPartCard, {
        part: pendingSandboxCall(),
        sequence: 1,
        messageStatus: "completed",
      }),
    );

    expect(html).not.toContain("Running python code…");
  });
});

describe("sandbox code preview through the stream lifecycle", () => {
  it("shows the same code preview from input streaming to the result", () => {
    let assistant: ChatMessage = {
      id: "assistant-message",
      role: "assistant",
      status: "streaming",
      parts: [],
    };
    const handlers = {
      updateAssistant: (updater: (message: ChatMessage) => ChatMessage) => {
        assistant = updater(assistant);
      },
      addPendingApproval: vi.fn(),
      clearPendingApprovals: vi.fn(),
      setCitations: vi.fn(),
    };
    const renderSandboxPart = () => {
      expect(assistant.parts).toHaveLength(1);
      return previewSection(
        render(
          createElement(ToolPartCard, {
            part: assistant.parts[0],
            sequence: 1,
            messageStatus: assistant.status,
          }),
        ),
      );
    };
    const events: Array<[ChatStreamEvent, string]> = [
      [
        {
          type: "tool_input_start",
          toolCallId: "sandbox-call",
          toolName: "run_code_sandbox",
        },
        "Writing tool input…",
      ],
      [
        {
          type: "tool_input_snapshot",
          toolCallId: "sandbox-call",
          toolName: "run_code_sandbox",
          inputText: JSON.stringify(sandboxCallInput),
        },
        "Writing python code…",
      ],
      [
        { type: "tool_input_end", toolCallId: "sandbox-call" },
        "Running python code…",
      ],
      [
        {
          type: "tool_call",
          toolCallId: "sandbox-call",
          toolName: "run_code_sandbox",
          input: sandboxCallInput,
        },
        "Running python code…",
      ],
    ];

    for (const [event, label] of events) {
      applyStreamEvent(event, handlers);
      const preview = renderSandboxPart();
      expect(preview).toContain(label);
      if (event.type !== "tool_input_start") {
        expect(preview).toContain("print(4242)");
        expect(preview).not.toContain("&quot;language&quot;");
      }
    }

    applyStreamEvent(
      {
        type: "tool_result",
        toolCallId: "sandbox-call",
        toolName: "run_code_sandbox",
        output: result([downloadable]),
      },
      handlers,
    );
    const done = renderSandboxPart();
    expect(done).not.toContain("Running python code…");
    expect(done.match(/Download report\.txt/g)).toHaveLength(1);
  });
});
