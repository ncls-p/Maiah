import { describe,expect,it } from "vitest";

import { listAdminUsers,updateManagedUser } from "@/modules/admin/use-cases";
import { dbModule } from "./admin-use-cases.test.db-module";

describe("listAdminUsers", () => {
  it("returns list of users with default role", async () => {
    const users = [
      {
        id: "u1",
        name: "Alice",
        email: "alice@example.com",
        role: null,
        banned: false,
        banReason: null,
        createdAt: new Date(),
      },
    ];
    // listAdminUsers uses .then() since it chains directly
    dbModule._sc.orderBy.mockResolvedValueOnce(users);

    const result = await listAdminUsers();
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("user");
  });
});

describe("updateManagedUser", () => {
  const targetUser = {
    id: "user-2",
    name: "Bob",
    email: "bob@example.com",
    role: "user",
    banned: false,
    banReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("throws when user not found", async () => {
    dbModule._sc.limit.mockResolvedValueOnce([]);

    await expect(
      updateManagedUser({
        actorUserId: "admin-1",
        userId: "nonexistent",
      }),
    ).rejects.toThrow("User not found");
  });

  it("throws when actor tries to remove own admin access", async () => {
    dbModule._sc.limit.mockResolvedValueOnce([{ ...targetUser, id: "admin-1", role: "admin" }]);

    await expect(
      updateManagedUser({
        actorUserId: "admin-1",
        userId: "admin-1",
        role: "user",
      }),
    ).rejects.toThrow("cannot remove your own admin access");
  });

  it("throws when actor tries to suspend own account", async () => {
    dbModule._sc.limit.mockResolvedValueOnce([{ ...targetUser, id: "admin-1", role: "admin" }]);

    await expect(
      updateManagedUser({
        actorUserId: "admin-1",
        userId: "admin-1",
        banned: true,
      }),
    ).rejects.toThrow("cannot suspend your own account");
  });

  it("throws when demoting last active admin", async () => {
    // updateManagedUser makes two select queries:
    // Q1: db.select().from(users).where(...).limit(1) — .limit() terminal
    // Q2 (getActiveAdminCount): db.select({value:count()}).from(users).where(and(...)) — .where() terminal
    // Q1's .where() must return chain so .limit() can be called
    dbModule._sc.where
      .mockReturnValueOnce(dbModule._sc) // Q1: keep chain for limit
      .mockResolvedValueOnce([{ value: 0 }]); // Q2: getActiveAdminCount → 0 remaining admins
    dbModule._sc.limit.mockResolvedValueOnce([{ ...targetUser, id: "user-2", role: "admin", banned: false }]);

    await expect(
      updateManagedUser({
        actorUserId: "admin-1",
        userId: "user-2",
        role: "user",
      }),
    ).rejects.toThrow("At least one active admin is required");
  });

  it("updates user role when valid", async () => {
    dbModule._sc.limit.mockResolvedValueOnce([targetUser]);
    dbModule._uc.returning.mockResolvedValueOnce([{ ...targetUser, role: "admin" }]);

    const result = await updateManagedUser({
      actorUserId: "admin-1",
      userId: "user-2",
      role: "admin",
    });
    expect(result.role).toBe("admin");
  });

  it("sets ban reason when banning", async () => {
    dbModule._sc.limit.mockResolvedValueOnce([targetUser]);
    dbModule._uc.returning.mockResolvedValueOnce([{ ...targetUser, banned: true, banReason: "Violated policy" }]);

    const result = await updateManagedUser({
      actorUserId: "admin-1",
      userId: "user-2",
      banned: true,
      banReason: "Violated policy",
    });
    expect(result.banned).toBe(true);
  });
});
