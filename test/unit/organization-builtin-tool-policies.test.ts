import { describe, expect, it } from "vitest";

import {
  builtInToolRequiresApprovalByDefault,
  resolveOrganizationBuiltInToolPolicies,
} from "@/modules/tool/organization-builtin-tool-policies";

describe("organization built-in tool policies", () => {
  it("preserves the existing safe defaults when no policy was configured", () => {
    const policies = resolveOrganizationBuiltInToolPolicies([]);
    const calculator = policies.find((tool) => tool.name === "calculator");
    const sandbox = policies.find((tool) => tool.name === "run_code_sandbox");

    expect(calculator).toMatchObject({
      enabled: true,
      requireApproval: false,
      configured: false,
    });
    expect(sandbox).toMatchObject({
      enabled: true,
      requireApproval: true,
      configured: false,
    });
  });

  it("applies explicit activation and approval choices by tool name", () => {
    const policies = resolveOrganizationBuiltInToolPolicies([
      {
        toolName: "run_code_sandbox",
        enabled: false,
        requireApproval: false,
      },
    ]);

    expect(
      policies.find((tool) => tool.name === "run_code_sandbox"),
    ).toMatchObject({
      enabled: false,
      requireApproval: false,
      configured: true,
    });
  });

  it("defaults only high and critical risk levels to human approval", () => {
    expect(builtInToolRequiresApprovalByDefault("low")).toBe(false);
    expect(builtInToolRequiresApprovalByDefault("medium")).toBe(false);
    expect(builtInToolRequiresApprovalByDefault("high")).toBe(true);
    expect(builtInToolRequiresApprovalByDefault("critical")).toBe(true);
  });
});
