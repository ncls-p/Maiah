import { describe, expect, it } from "vitest";

import { buildAccessPeople } from "@/modules/iam/access-view-model";

describe("buildAccessPeople", () => {
  it("shows one person row with every direct and inherited assignment", () => {
    const people = buildAccessPeople({
      members: [
        {
          id: "member-1",
          userId: "user-1",
          name: "Test User",
          email: "test@example.com",
          status: "active",
        },
      ],
      accounts: [
        {
          id: "user-1",
          name: "Test User",
          email: "test@example.com",
          role: "admin",
          banned: false,
        },
      ],
      teams: [],
      assignments: [
        {
          id: "organization-owner",
          principalType: "user",
          principalId: "user-1",
          inherited: true,
        },
        {
          id: "project-admin",
          principalType: "user",
          principalId: "user-1",
          inherited: false,
        },
      ],
    });

    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({
      userId: "user-1",
      platformRole: "admin",
      memberStatus: "active",
    });
    expect(people[0].assignments).toHaveLength(2);
  });

  it("keeps account-only users searchable from the same people collection", () => {
    const people = buildAccessPeople({
      members: [],
      accounts: [
        {
          id: "user-2",
          name: "Pending User",
          email: "pending@example.com",
          role: "user",
          banned: false,
        },
      ],
      teams: [],
      assignments: [],
    });

    expect(people).toEqual([
      expect.objectContaining({
        userId: "user-2",
        memberStatus: "not-member",
        assignments: [],
      }),
    ]);
  });
});
