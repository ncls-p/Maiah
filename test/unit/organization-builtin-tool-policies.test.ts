import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  selections: [] as Array<{
    terminal: "limit" | "where";
    value: unknown;
  }>,
  values: vi.fn().mockReturnThis(),
  onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/server/infrastructure/db", () => ({
  db: {
    select: vi.fn(() => {
      const selection = database.selections.shift();
      if (!selection) throw new Error("Unexpected database selection");
      if (selection.terminal === "limit") {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue(selection.value),
            })),
          })),
        };
      }
      return {
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(selection.value),
        })),
      };
    }),
    insert: vi.fn(() => ({
      values: database.values,
      onConflictDoUpdate: database.onConflictDoUpdate,
    })),
  },
}));

import {
  builtInToolRequiresApprovalByDefault,
  getOrganizationBuiltInToolPolicyMap,
  listOrganizationBuiltInToolPolicies,
  resolveOrganizationBuiltInToolPolicies,
  updateOrganizationBuiltInToolPolicy,
} from "@/modules/tool/organization-builtin-tool-policies";

beforeEach(() => {
  vi.clearAllMocks();
  database.selections = [];
  database.values.mockReturnThis();
  database.onConflictDoUpdate.mockResolvedValue(undefined);
});

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

  it("returns no policies when the workspace has no organization", async () => {
    database.selections.push({ terminal: "limit", value: [] });

    await expect(
      listOrganizationBuiltInToolPolicies("workspace-1"),
    ).resolves.toEqual([]);
  });

  it("loads configured policies and exposes an effective lookup map", async () => {
    database.selections.push(
      {
        terminal: "limit",
        value: [{ organizationId: "organization-1" }],
      },
      {
        terminal: "where",
        value: [
          {
            toolName: "calculator",
            enabled: false,
            requireApproval: true,
          },
        ],
      },
    );

    const policies = await listOrganizationBuiltInToolPolicies("workspace-1");
    expect(
      policies.find((policy) => policy.name === "calculator"),
    ).toMatchObject({
      enabled: false,
      requireApproval: true,
      configured: true,
    });

    database.selections.push(
      {
        terminal: "limit",
        value: [{ organizationId: "organization-1" }],
      },
      {
        terminal: "where",
        value: [
          {
            toolName: "calculator",
            enabled: false,
            requireApproval: true,
          },
        ],
      },
    );
    const map = await getOrganizationBuiltInToolPolicyMap("workspace-1");
    expect(map.get("calculator")).toEqual({
      enabled: false,
      requireApproval: true,
    });
  });

  it("rejects updates outside an organization or for an unknown tool", async () => {
    database.selections.push({ terminal: "limit", value: [] });
    await expect(
      updateOrganizationBuiltInToolPolicy({
        workspaceId: "workspace-1",
        toolName: "calculator",
        enabled: false,
        updatedById: "user-1",
      }),
    ).resolves.toBeNull();

    database.selections.push({
      terminal: "limit",
      value: [{ organizationId: "organization-1" }],
    });
    await expect(
      updateOrganizationBuiltInToolPolicy({
        workspaceId: "workspace-1",
        toolName: "missing-tool",
        enabled: false,
        updatedById: "user-1",
      }),
    ).resolves.toBeNull();
  });

  it("upserts an organization policy while preserving omitted choices", async () => {
    database.selections.push(
      {
        terminal: "limit",
        value: [{ organizationId: "organization-1" }],
      },
      {
        terminal: "limit",
        value: [{ organizationId: "organization-1" }],
      },
      {
        terminal: "where",
        value: [
          {
            toolName: "calculator",
            enabled: true,
            requireApproval: false,
          },
        ],
      },
    );

    const result = await updateOrganizationBuiltInToolPolicy({
      workspaceId: "workspace-1",
      toolName: "calculator",
      enabled: false,
      updatedById: "user-1",
    });

    expect(database.values).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "organization-1",
        toolName: "calculator",
        enabled: false,
        requireApproval: false,
        updatedById: "user-1",
      }),
    );
    expect(database.onConflictDoUpdate).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      name: "calculator",
      enabled: false,
      requireApproval: false,
      configured: true,
    });
  });
});
