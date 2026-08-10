import { describe, expect, it } from "vitest";

import { parseAgentToolDisplayContext } from "@/modules/agent/tool-progress-payload";

const context = {
  agentId: "agent-1",
  agentName: "Research specialist",
  runId: "run-1",
  parentRunId: "run-root",
  depth: 1,
  status: "running" as const,
};

describe("agent tool progress metadata", () => {
  it("accepts valid server-owned display context", () => {
    expect(parseAgentToolDisplayContext(context)).toEqual(context);
  });

  it("rejects malformed display context", () => {
    expect(
      parseAgentToolDisplayContext({
        ...context,
        depth: -1,
      }),
    ).toBeNull();
    expect(
      parseAgentToolDisplayContext({
        agentId: "missing-fields",
      }),
    ).toBeNull();
  });

  it("does not treat an agent-shaped tool output as trusted provenance", () => {
    expect(
      parseAgentToolDisplayContext({
        output: {
          agentContext: context,
          value: "tool-controlled",
        },
      }),
    ).toBeNull();
  });
});
