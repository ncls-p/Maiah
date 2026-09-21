import { describe, expect, it } from "vitest";
import { updateSpecialistVersion } from "@/app/[locale]/(workspace)/agents/[agentId]/delegation-version";
import type { DelegationBinding } from "@/app/[locale]/(workspace)/agents/[agentId]/types";

describe("explicit specialist version updates", () => {
  it("preserves the mission, binding order and other pinned versions without mutating saved state", () => {
    const bindings: DelegationBinding[] = [
      {
        childAgentId: "it",
        childAgentVersionId: "v19",
        instructions: "Custom mission",
        childVersion: {
          id: "v19",
          versionNumber: 19,
          name: null,
          isActive: false,
        },
      },
      {
        childAgentId: "hr",
        childAgentVersionId: "v4",
        instructions: "HR mission",
      },
    ];
    const updated = updateSpecialistVersion(bindings, "it", "v22");
    expect(updated[0]).toMatchObject({
      childAgentId: "it",
      childAgentVersionId: "v22",
      instructions: "Custom mission",
      childVersion: null,
    });
    expect(updated[1]).toBe(bindings[1]);
    expect(bindings[0].childAgentVersionId).toBe("v19");
    expect(updateSpecialistVersion(updated, "it", "v22")[0]).toBe(updated[0]);
  });
});
