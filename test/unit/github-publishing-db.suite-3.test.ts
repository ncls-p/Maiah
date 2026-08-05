import { generateKeyPairSync } from "node:crypto";
import { beforeAll,beforeEach,describe,expect,it,vi } from "vitest";

vi.mock("@/modules/code-workspace/storage", () => ({
  getCodeWorkspaceFilesForPublish: vi.fn(),
  isTextWorkspacePath: vi.fn((filePath: string) => /\.(?:txt|md|js|json|html|css)$/i.test(filePath)),
  normalizeWorkspacePath: vi.fn((value: string) => value.replace(/^\/+|\/+$/g, "")),
}));

type Chain = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  onConflictDoUpdate: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
};

function makeChain(): Chain {
  const c = {} as Chain;
  for (const key of ["select", "insert", "delete", "from", "where", "orderBy", "values", "onConflictDoUpdate"] as const) {
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
      delete: vi.fn(),
    },
    _c: chain,
  };
});

import * as storage from "@/modules/code-workspace/storage";
import * as _dbModule from "@/server/infrastructure/db";

const dbModule = _dbModule as unknown as DbModule;
let publishing: typeof import("@/modules/github/publishing");

function resetDb() {
  dbModule.db.select.mockReset().mockReturnValue(dbModule._c);
  dbModule.db.insert.mockReset().mockReturnValue(dbModule._c);
  dbModule.db.delete.mockReset().mockReturnValue(dbModule._c);
  for (const key of ["select", "insert", "delete", "from", "where", "orderBy", "values", "onConflictDoUpdate"] as const) {
    dbModule._c[key].mockReset().mockReturnThis();
  }
  dbModule._c.limit.mockReset().mockResolvedValue([]);
  dbModule._c.returning.mockReset().mockResolvedValue([]);
}

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    text: async () => JSON.stringify(body),
  } as Response;
}

const ids = {
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  projectId: "33333333-3333-4333-8333-333333333333",
  repositoryId: "44444444-4444-4444-8444-444444444444",
};

const repoRow = {
  id: ids.repositoryId,
  connectionId: "conn-1",
  userId: ids.userId,
  githubRepositoryId: "99",
  owner: "octo",
  name: "repo",
  fullName: "octo/repo",
  private: false,
  defaultBranch: "main",
  permissionsJson: { push: true },
};
const connectionRow = {
  id: "conn-1",
  userId: ids.userId,
  installationId: "123",
  accountLogin: "octo",
  accountType: "Organization",
  repositorySelection: "selected",
  settingsUrl: "https://github.com/settings/installations/123",
  lastSyncedAt: new Date("2025-01-01T00:00:00Z"),
  updatedAt: new Date("2025-01-01T00:00:00Z"),
};

beforeAll(async () => {
  const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ format: "pem", type: "pkcs1" }).toString();
  process.env.GITHUB_APP_ID = "12345";
  process.env.GITHUB_APP_SLUG = "ai-hub-test";
  process.env.GITHUB_APP_PRIVATE_KEY = privateKey;
  publishing = await import("@/modules/github/publishing");
});

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
  vi.mocked(storage.getCodeWorkspaceFilesForPublish).mockResolvedValue({
    metadata: { id: ids.projectId },
    files: [
      {
        path: "src/index.js",
        bytes: new TextEncoder().encode("console.log('ok')"),
        size: 17,
      },
      {
        path: "README.md",
        bytes: new TextEncoder().encode("# Readme"),
        size: 8,
      },
    ],
  } as never);
  vi.spyOn(globalThis, "fetch").mockReset();
});

describe("GitHub publishing DB/API flows", () => {
  it("handles direct-push validation, safety checks, empty repositories, and failure audit rows", async () => {
    await expect(
      publishing.publishCodeWorkspaceToGitHub({
        workspaceId: ids.workspaceId,
        userId: ids.userId,
        projectId: ids.projectId,
        repositoryId: ids.repositoryId,
        mode: "direct_push",
        targetBranch: "main",
        commitMessage: "Push",
      }),
    ).rejects.toThrow("Direct push requires explicit user confirmation");

    resetDb();
    dbModule._c.limit.mockResolvedValueOnce([{ ...repoRow, permissionsJson: { pull: true } }]).mockResolvedValueOnce([connectionRow]);
    await expect(
      publishing.publishCodeWorkspaceToGitHub({
        workspaceId: ids.workspaceId,
        userId: ids.userId,
        projectId: ids.projectId,
        repositoryId: ids.repositoryId,
        mode: "direct_push",
        targetBranch: "main",
        commitMessage: "Push",
        confirmDirectPush: true,
      }),
    ).rejects.toThrow("repository write access");

    resetDb();
    vi.mocked(storage.getCodeWorkspaceFilesForPublish).mockResolvedValueOnce({
      metadata: { id: ids.projectId },
      files: [{ path: ".env", bytes: new TextEncoder().encode("SECRET=1"), size: 8 }],
    } as never);
    dbModule._c.limit.mockResolvedValueOnce([repoRow]).mockResolvedValueOnce([connectionRow]);
    await expect(
      publishing.publishCodeWorkspaceToGitHub({
        workspaceId: ids.workspaceId,
        userId: ids.userId,
        projectId: ids.projectId,
        repositoryId: ids.repositoryId,
        mode: "direct_push",
        targetBranch: "main",
        commitMessage: "Push",
        confirmDirectPush: true,
      }),
    ).rejects.toThrow("Publishing this path is blocked");

    resetDb();
    dbModule._c.limit.mockResolvedValueOnce([repoRow]).mockResolvedValueOnce([connectionRow]);
    dbModule._c.returning.mockResolvedValueOnce([{ id: "event-empty" }]);
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(jsonResponse({ token: "installation-token" }) as never)
      .mockResolvedValueOnce(jsonResponse({ message: "Git Repository is empty" }, { ok: false, status: 409, statusText: "Conflict" }) as never)
      .mockResolvedValueOnce(jsonResponse({ commit: { sha: "commit-a" } }) as never)
      .mockResolvedValueOnce(jsonResponse({ commit: { sha: "commit-b" } }) as never);
    await expect(
      publishing.publishCodeWorkspaceToGitHub({
        workspaceId: ids.workspaceId,
        userId: ids.userId,
        projectId: ids.projectId,
        repositoryId: ids.repositoryId,
        mode: "direct_push",
        targetBranch: "main",
        commitMessage: "Push",
        confirmDirectPush: true,
      }),
    ).resolves.toMatchObject({
      mode: "direct_push",
      commitSha: "commit-b",
      sourceBranch: null,
    });

    resetDb();
    dbModule._c.limit.mockResolvedValueOnce([repoRow]).mockResolvedValueOnce([connectionRow]);
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(jsonResponse({ token: "installation-token" }) as never)
      .mockResolvedValueOnce(jsonResponse({ object: { sha: "base", type: "commit" } }) as never)
      .mockResolvedValueOnce(jsonResponse({ tree: { sha: "tree-base" } }) as never)
      .mockResolvedValueOnce(jsonResponse({ message: "boom" }, { ok: false, status: 500, statusText: "Boom" }) as never);
    await expect(
      publishing.publishCodeWorkspaceToGitHub({
        workspaceId: ids.workspaceId,
        userId: ids.userId,
        projectId: ids.projectId,
        repositoryId: ids.repositoryId,
        mode: "direct_push",
        targetBranch: "main",
        commitMessage: "Push",
        confirmDirectPush: true,
      }),
    ).rejects.toThrow("GitHub API error (500): boom");
    expect(dbModule._c.values).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });
});
