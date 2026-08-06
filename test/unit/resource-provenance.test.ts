import { describe,expect,it } from "vitest";

import { buildResourceProvenance } from "@/modules/iam/resource-provenance";

const context = {
  currentUserId: "user-1",
  workspaceName: "Maiah",
  organizationName: "Deodis",
  ownerNames: new Map([
    ["user-1", "Nicolas Pierrot"],
    ["user-2", "Alice Martin"],
  ]),
};

describe("resource provenance", () => {
  it("identifies personal resources with their owner", () => {
    expect(buildResourceProvenance({ createdById: "user-1", isGlobal: false }, context)).toEqual({
      scope: "user",
      scopeName: "Nicolas Pierrot",
      ownerName: "Nicolas Pierrot",
    });
  });

  it("identifies organization resources before their creator", () => {
    expect(buildResourceProvenance({ createdById: "user-1", isGlobal: true }, context)).toEqual({
      scope: "organization",
      scopeName: "Deodis",
      ownerName: "Nicolas Pierrot",
    });
  });

  it("identifies a shared resource from another user as project-owned", () => {
    expect(buildResourceProvenance({ createdById: "user-2", isGlobal: false }, context)).toEqual({
      scope: "workspace",
      scopeName: "Maiah",
      ownerName: "Alice Martin",
    });
  });
});
