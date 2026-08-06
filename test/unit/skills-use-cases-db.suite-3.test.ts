import { beforeEach,describe,expect,it,vi } from "vitest";

vi.mock("@/server/domain/services/audit", () => ({
  audit: { emit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/logger", () => ({
  logHandledError: vi.fn(),
}));

const authorizationMocks = vi.hoisted(() => ({
  hasPermission: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/server/domain/services/authorization", () => ({
  authorization: { hasPermission: authorizationMocks.hasPermission },
}));

type Chain = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
};

function makeChain(): Chain {
  const c = {} as Chain;
  for (const key of ["select", "insert", "update", "delete", "from", "innerJoin", "where", "orderBy", "values", "set"] as const) {
    c[key] = vi.fn().mockReturnThis();
  }
  c.limit = vi.fn().mockResolvedValue([]);
  c.returning = vi.fn().mockResolvedValue([]);
  return c;
}

type DbModule = {
  db: {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  _c: Chain;
};

vi.mock("@/server/infrastructure/db", () => {
  const chain = makeChain();
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    _c: chain,
  };
});

import { archiveAgentSkill,cloneSkillBindings,replaceSkillBindingsForVersion,updateSkillManually } from "@/modules/skills/use-cases";
import * as _dbModule from "@/server/infrastructure/db";

const dbModule = _dbModule as unknown as DbModule;

function resetDb() {
  dbModule.db.select.mockReset().mockReturnValue(dbModule._c);
  dbModule.db.insert.mockReset().mockReturnValue(dbModule._c);
  dbModule.db.update.mockReset().mockReturnValue(dbModule._c);
  dbModule.db.delete.mockReset().mockReturnValue(dbModule._c);
  for (const key of ["select", "insert", "update", "delete", "from", "innerJoin", "where", "orderBy", "values", "set"] as const) {
    dbModule._c[key].mockReset().mockReturnThis();
  }
  dbModule._c.limit.mockReset().mockResolvedValue([]);
  dbModule._c.returning.mockReset().mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  authorizationMocks.hasPermission.mockResolvedValue(false);
  resetDb();
});

const ownSkill = {
  id: "skill-1",
  workspaceId: "ws-1",
  createdById: "user-1",
  name: "research",
  description: "Research skill",
  isGlobal: false,
  markdownFilesJson: [{ path: "SKILL.md", content: "# Research" }],
};

describe("skill bindings", () => {

  it("replaces, clears, validates, and clones bindings", async () => {
    await replaceSkillBindingsForVersion("version-1", "ws-1", []);
    expect(dbModule.db.delete).toHaveBeenCalled();

    resetDb();
    dbModule._c.where.mockResolvedValueOnce([{ id: "skill-1", createdById: "user-1", isGlobal: false }]);
    await expect(
      replaceSkillBindingsForVersion("version-1", "ws-1", ["skill-1", "skill-1"], {
        userId: "user-1",
      }),
    ).resolves.toBeUndefined();
    expect(dbModule._c.values).toHaveBeenCalledWith([{ agentVersionId: "version-1", skillId: "skill-1" }]);

    resetDb();
    dbModule._c.where.mockResolvedValueOnce([{ id: "skill-1" }]);
    await expect(replaceSkillBindingsForVersion("version-1", "ws-1", ["missing"])).rejects.toThrow("Skill not found");

    resetDb();
    await cloneSkillBindings(null, "version-2");
    expect(dbModule.db.select).not.toHaveBeenCalled();

    resetDb();
    dbModule._c.where.mockResolvedValueOnce([
      {
        id: "skill-1",
        skillId: "skill-1",
        createdById: "user-1",
        isGlobal: false,
      },
      {
        id: "skill-2",
        skillId: "skill-2",
        createdById: "other",
        isGlobal: true,
      },
    ]);
    await cloneSkillBindings("version-1", "version-2", "ws-1", {
      userId: "user-1",
    });
    expect(dbModule._c.values).toHaveBeenCalledWith([
      { agentVersionId: "version-2", skillId: "skill-1" },
      { agentVersionId: "version-2", skillId: "skill-2" },
    ]);
  });
});

describe("manual skill management", () => {

  it("updates manageable skills and rejects unauthorized global changes", async () => {
    dbModule._c.limit.mockResolvedValueOnce([{ ...ownSkill, createdById: "other", isGlobal: false }]);
    await expect(
      updateSkillManually({
        workspaceId: "ws-1",
        userId: "user-1",
        skillId: "skill-1",
        name: "research",
        description: "Research skill",
        markdownFiles: [{ path: "SKILL.md", content: "# Skill" }],
      }),
    ).rejects.toThrow("Skill not found");

    resetDb();
    dbModule._c.limit.mockResolvedValueOnce([ownSkill]);
    await expect(
      updateSkillManually({
        workspaceId: "ws-1",
        userId: "user-1",
        skillId: "skill-1",
        name: "research",
        description: "Research skill",
        markdownFiles: [{ path: "SKILL.md", content: "# Skill" }],
        isGlobal: true,
      }),
    ).rejects.toThrow("Only admins can make skills global");

    resetDb();
    dbModule._c.limit.mockResolvedValueOnce([ownSkill]);
    dbModule._c.returning.mockResolvedValueOnce([{ ...ownSkill, description: "Updated" }]);
    await expect(
      updateSkillManually({
        workspaceId: "ws-1",
        userId: "user-1",
        skillId: "skill-1",
        name: "research",
        description: "Updated",
        markdownFiles: [{ path: "SKILL.md", content: "# Skill" }],
        isGlobal: false,
      }),
    ).resolves.toMatchObject({ description: "Updated" });
  });
});
describe("skill listing and archiving", () => {
  it("archives manageable skills and rejects missing or unauthorized skills", async () => {
    dbModule._c.limit.mockResolvedValueOnce([]);
    await expect(
      archiveAgentSkill({
        workspaceId: "ws-1",
        userId: "user-1",
        skillId: "missing",
      }),
    ).rejects.toThrow("Skill not found");

    resetDb();
    dbModule._c.limit.mockResolvedValueOnce([{ ...ownSkill, createdById: "other", isGlobal: false }]);
    await expect(
      archiveAgentSkill({
        workspaceId: "ws-1",
        userId: "user-1",
        skillId: "skill-1",
      }),
    ).rejects.toThrow("Skill not found");

    resetDb();
    dbModule._c.limit.mockResolvedValueOnce([ownSkill]);
    dbModule._c.returning.mockResolvedValueOnce([ownSkill]);
    await expect(
      archiveAgentSkill({
        workspaceId: "ws-1",
        userId: "user-1",
        skillId: "skill-1",
      }),
    ).resolves.toBeUndefined();
    expect(dbModule.db.update).toHaveBeenCalled();
  });
});
