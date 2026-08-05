import { describe,expect,it } from "vitest";

import { toolPartMatchesApproval } from "@/components/chat/chat-message-rendering-utils";

describe("tool approval rendering", () => {
  it("keeps a large approval attached to its tool card", () => {
    const code = "const value = 1;\n".repeat(80);
    const part = {
      type: "tool-call",
      content: JSON.stringify({
        toolCallId: "call-1",
        toolName: "run_code_sandbox",
        input: {
          language: "javascript",
          code,
          timeoutMs: 30_000,
        },
      }),
    };
    const approval = {
      invocationId: "invocation-1",
      toolName: "run_code_sandbox",
      input: {
        language: "javascript",
        code: `${code.slice(0, 500)}… [TRUNCATED]`,
        timeoutMs: 30_000,
      },
    };

    expect(toolPartMatchesApproval(part, approval)).toBe(true);
  });
});
