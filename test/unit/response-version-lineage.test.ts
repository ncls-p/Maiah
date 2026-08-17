import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return {
    chain,
    db: {
      execute: vi.fn(),
      select: vi.fn(() => chain),
    },
  };
});

vi.mock("@/server/infrastructure/db", () => ({ db: mocks.db }));

import {
  listActiveResponseVersionDescendants,
  resolveResponseVersionRootId,
} from "@/modules/chat/response-version-lineage";

describe("response-version lineage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.chain.from.mockReturnValue(mocks.chain);
    mocks.chain.where.mockReturnValue(mocks.chain);
  });

  it("walks every response-version parent to the visible root", async () => {
    mocks.chain.limit
      .mockResolvedValueOnce([
        {
          id: "version-1",
          parentConversationId: "root",
          branchKind: "response_version",
        },
      ])
      .mockResolvedValueOnce([
        { id: "root", parentConversationId: null, branchKind: null },
      ]);

    await expect(
      resolveResponseVersionRootId({
        id: "version-2",
        parentConversationId: "version-1",
        branchKind: "response_version",
      }),
    ).resolves.toBe("root");
  });

  it("uses a recursive descendant query carrying the original root", async () => {
    const rows = [
      {
        id: "version-2",
        parentConversationId: "version-1",
        rootConversationId: "root",
      },
    ];
    mocks.db.execute.mockResolvedValueOnce({ rows });

    await expect(
      listActiveResponseVersionDescendants(["root"]),
    ).resolves.toEqual(rows);

    const statement = mocks.db.execute.mock.calls[0]?.[0] as SQL;
    const query = new PgDialect().sqlToQuery(statement);
    expect(query.sql).toContain("WITH RECURSIVE response_versions");
    expect(query.sql).toContain('lineage."rootConversationId"');
    expect(query.params).toContainEqual(["root"]);
  });

  it("does not query for an empty visible page", async () => {
    await expect(listActiveResponseVersionDescendants([])).resolves.toEqual([]);
    expect(mocks.db.execute).not.toHaveBeenCalled();
  });
});
