import { resolveActiveWorkspaceId } from "@/lib/workspace-selection";
import { describe, expect, it } from "vitest";

const workspaces = [
  { id: "workspace-a", isActive: false },
  { id: "workspace-b", isActive: true },
];

describe("resolveActiveWorkspaceId", () => {
  it("keeps the current valid workspace during a refresh", () => {
    expect(
      resolveActiveWorkspaceId(workspaces, {
        currentWorkspaceId: "workspace-a",
        storedWorkspaceId: "workspace-a",
      }),
    ).toBe("workspace-a");
  });

  it("uses the account preference before browser-local state", () => {
    expect(
      resolveActiveWorkspaceId(workspaces, {
        currentWorkspaceId: null,
        storedWorkspaceId: "workspace-a",
      }),
    ).toBe("workspace-b");
  });

  it("migrates browser-local state when no account preference exists", () => {
    expect(
      resolveActiveWorkspaceId(
        workspaces.map((workspace) => ({ ...workspace, isActive: false })),
        {
          currentWorkspaceId: null,
          storedWorkspaceId: "workspace-b",
        },
      ),
    ).toBe("workspace-b");
  });

  it("falls back deterministically when no preference exists", () => {
    expect(
      resolveActiveWorkspaceId(
        workspaces.map((workspace) => ({ ...workspace, isActive: false })),
        { currentWorkspaceId: null, storedWorkspaceId: null },
      ),
    ).toBe("workspace-a");
  });

  it("returns null when no workspace is available", () => {
    expect(
      resolveActiveWorkspaceId([], {
        currentWorkspaceId: null,
        storedWorkspaceId: null,
      }),
    ).toBeNull();
  });
});
