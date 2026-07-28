import { describe, expect, it } from "vitest";

import {
  expandPermissionGrants,
  isKnownPermission,
  isPermissionCompatibleWithScope,
  KNOWN_PERMISSIONS,
  PERMISSION_CATALOG,
} from "@/modules/iam/permission-catalog";
import { SYSTEM_ROLES } from "@/server/domain/entities/iam";

describe("IAM permission catalog", () => {
  it("expands built-in wildcard grants into editable catalog permissions", () => {
    const permissions = expandPermissionGrants(["agents.*", "workflows.view"]);

    expect(permissions).toContain("agents.view");
    expect(permissions).toContain("agents.create");
    expect(permissions).toContain("workflows.view");
    expect(permissions).not.toContain("workflows.create");
    expect(permissions).not.toContain("agents.*");
  });

  it("contains unique permission identifiers", () => {
    const permissions = PERMISSION_CATALOG.flatMap((group) =>
      group.permissions.map((permission) => permission.id),
    );

    expect(new Set(permissions).size).toBe(permissions.length);
    expect(KNOWN_PERMISSIONS.size).toBe(permissions.length);
  });

  it("contains the permissions required to administer the hierarchy", () => {
    for (const permission of [
      "organization.get",
      "workspaces.create",
      "members.manage",
      "teams.manage",
      "roles.manage",
    ]) {
      expect(isKnownPermission(permission)).toBe(true);
    }
  });

  it("keeps organization-only permissions out of project roles", () => {
    expect(isPermissionCompatibleWithScope("members.manage", "workspace")).toBe(
      false,
    );
    expect(isPermissionCompatibleWithScope("agents.chat", "workspace")).toBe(
      true,
    );
    expect(
      isPermissionCompatibleWithScope("members.manage", "organization"),
    ).toBe(true);
  });

  it("gives organization owners project permissions that can be inherited", () => {
    const owner = SYSTEM_ROLES.find(
      (role) => role.name === "organization.owner",
    );

    expect(owner?.permissions).toEqual(
      expect.arrayContaining([
        "workspaces.create",
        "roles.manage",
        "agents.chat",
        "providers.manage",
      ]),
    );
  });

  it("keeps the built-in project viewer read-only", () => {
    const viewer = SYSTEM_ROLES.find(
      (role) => role.name === "workspace.viewer",
    );

    expect(viewer?.permissions).toContain("agents.get");
    expect(viewer?.permissions).not.toContain("agents.create");
    expect(viewer?.permissions).not.toContain("roles.manage");
  });
});
