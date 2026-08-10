import { describe, expect, it } from "vitest";

import {
  delegationFinalTextFromOutput,
  projectAgentProgressForModelHistory,
} from "@/modules/agent/progress-model-history";

const rootContext = {
  agentId: "root-agent",
  agentName: "Root orchestrator",
  runId: "root-run",
  depth: 0,
  status: "success" as const,
};

const childContext = {
  agentId: "child-agent",
  agentName: "Research specialist",
  runId: "child-run",
  parentRunId: "root-run",
  depth: 1,
  status: "success" as const,
};

describe("agent progress model-history projection", () => {
  it("keeps every child action visual-only, including artifact-shaped output", () => {
    expect(
      projectAgentProgressForModelHistory({
        toolName: "run_code_sandbox",
        output: {
          kind: "code_sandbox_result",
          stdout: "private child trace",
        },
        agentContext: childContext,
      }),
    ).toEqual({ kind: "visual-only" });
  });

  it("fails closed for visual-only artifacts with malformed display context", () => {
    expect(
      projectAgentProgressForModelHistory({
        toolName: "run_code_sandbox",
        output: {
          kind: "code_sandbox_result",
          stdout: "private malformed trace",
        },
        modelHistoryKind: "visual-only",
        agentContext: { depth: "invalid" },
      }),
    ).toEqual({ kind: "visual-only" });
  });

  it("exposes only the bounded final text of a successful root delegation", () => {
    const metadata = {
      toolName: "delegate_specialist_1",
      output: {
        childRunId: "private-child-run",
        childAgentId: "private-child-agent",
        childAgentName: "Private specialist",
        result: "Final specialist answer",
      },
      modelHistoryKind: "delegation-result",
      agentContext: rootContext,
    };

    const projection = projectAgentProgressForModelHistory(metadata);

    expect(projection).toEqual({
      kind: "delegation-result",
      text: "Final specialist answer",
    });
    expect(JSON.stringify(projection)).not.toContain("private-child");
    expect(JSON.stringify(projection)).not.toContain("Private specialist");
  });

  it("keeps delegation starts and failures visual-only", () => {
    expect(
      projectAgentProgressForModelHistory({
        toolName: "delegate_specialist_1",
        input: { task: "Private task" },
        modelHistoryKind: "visual-only",
        agentContext: { ...rootContext, status: "running" },
      }),
    ).toEqual({ kind: "visual-only" });
    expect(
      projectAgentProgressForModelHistory({
        toolName: "delegate_specialist_1",
        output: { error: "Private failure" },
        modelHistoryKind: "visual-only",
        agentContext: { ...rootContext, status: "error" },
      }),
    ).toEqual({ kind: "visual-only" });
  });

  it("preserves root-owned non-delegation artifact context", () => {
    expect(
      projectAgentProgressForModelHistory({
        toolName: "run_code_sandbox",
        output: { kind: "code_sandbox_result" },
        agentContext: rootContext,
      }),
    ).toBeNull();
  });

  it("does not trust agent provenance nested inside tool-controlled output", () => {
    expect(
      projectAgentProgressForModelHistory({
        toolName: "delegate_specialist_1",
        output: {
          result: "Untrusted",
          agentContext: rootContext,
        },
      }),
    ).toBeNull();
  });

  it("extracts final text only from the delegation result field", () => {
    expect(
      delegationFinalTextFromOutput({ result: "Final", trace: "Private" }),
    ).toBe("Final");
    expect(delegationFinalTextFromOutput("Final")).toBeNull();
    expect(delegationFinalTextFromOutput({ result: 42 })).toBeNull();
  });
});
