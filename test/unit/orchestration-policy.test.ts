import { describe, expect, it } from "vitest";
import {
  normalizeOrchestrationPolicy,
  orchestrationPolicyCaps,
  orchestrationPolicyDefaults,
  orchestrationPolicySchema,
} from "@/modules/agent/orchestration-policy";

describe("orchestration policy", () => {
  it("uses conservative defaults", () => {
    expect(normalizeOrchestrationPolicy(null)).toEqual(
      orchestrationPolicyDefaults,
    );
  });

  it("rejects values above hard runtime caps", () => {
    expect(
      orchestrationPolicySchema.safeParse({
        ...orchestrationPolicyDefaults,
        maxDepth: orchestrationPolicyCaps.maxDepth + 1,
      }).success,
    ).toBe(false);
  });

  it("accepts an explicit bounded policy", () => {
    expect(
      normalizeOrchestrationPolicy({ maxParallel: 1, timeoutMs: 30_000 }),
    ).toMatchObject({ maxParallel: 1, timeoutMs: 30_000 });
  });
});
