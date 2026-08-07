import { describe, expect, it } from "vitest";

import { formatWorkflowRunInput, parseWorkflowRunInput } from "@/components/workflows/workflow-builder.run-input";

describe("workflow default run input", () => {
  it("round-trips nested JSON values", () => {
    const value = { message: "Bonjour", user: { id: 42 }, flags: [true, false] };
    expect(parseWorkflowRunInput(formatWorkflowRunInput(value))).toEqual({ valid: true, input: value });
  });

  it("rejects invalid JSON before saving or running", () => {
    expect(parseWorkflowRunInput('{"message":')).toEqual({ valid: false });
  });
});
