import { describe, expect, it } from "vitest";

import { delegationFailureDetails } from "@/components/chat/chat-message-rendering-utils";

describe("delegation failure display details", () => {
  it("extracts the safe error code and reason from progress output", () => {
    expect(
      delegationFailureDetails({
        errorCode: "AGENT_TOKEN_BUDGET_EXCEEDED",
        error: "Agent tree token budget exceeded",
      }),
    ).toEqual({
      errorCode: "AGENT_TOKEN_BUDGET_EXCEEDED",
      reason: "Agent tree token budget exceeded",
    });
  });

  it("ignores malformed failure details", () => {
    expect(
      delegationFailureDetails({ errorCode: 42, error: { secret: true } }),
    ).toEqual({ errorCode: null, reason: null });
  });
});
