import { beforeEach, describe, expect, it, vi } from "vitest";

import { listResourceShareTargets } from "@/modules/iam/resource-sharing";
import * as _dbModule from "@/server/infrastructure/db";

type QueryChain = {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

const queryResults: unknown[][] = [];

vi.mock("@/server/infrastructure/db", () => ({
  db: { select: vi.fn() },
}));

const dbModule = _dbModule as unknown as {
  db: { select: ReturnType<typeof vi.fn> };
};

function queryChain(result: unknown[]): QueryChain {
  const chain = {} as QueryChain;
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn().mockResolvedValue(result);
  chain.limit = vi.fn().mockResolvedValue(result);
  return chain;
}

beforeEach(() => {
  queryResults.length = 0;
  vi.clearAllMocks();
  dbModule.db.select.mockImplementation(() =>
    queryChain(queryResults.shift() ?? []),
  );
});

describe("listResourceShareTargets", () => {
  it("returns only a non-assistant resource when dependency sharing is enabled", async () => {
    await expect(
      listResourceShareTargets({
        resourceType: "knowledge_base",
        resourceId: "kb-1",
        includeDependencies: true,
      }),
    ).resolves.toEqual([{ type: "knowledge_base", id: "kb-1" }]);
    expect(dbModule.db.select).not.toHaveBeenCalled();
  });

  it("includes every active assistant runtime dependency recursively", async () => {
    queryResults.push(
      [{ activeVersionId: "version-1" }],
      [{ providerId: "provider-1", modelId: "model-1" }],
      [{ id: "kb-1" }],
      [{ id: "skill-1" }],
      [{ agentId: "agent-2", versionId: "version-2" }],
      [
        { source: "mcp", id: "mcp-tool-1" },
        { source: "custom", id: "custom-tool-1" },
      ],
      [{ id: "mcp-server-1" }],
      [{ providerId: "provider-2", modelId: "model-2" }],
      [],
      [],
      [],
      [],
    );

    const result = await listResourceShareTargets({
      resourceType: "agent",
      resourceId: "agent-1",
      includeDependencies: true,
    });

    expect(result).toEqual(
      expect.arrayContaining([
        { type: "agent", id: "agent-1" },
        { type: "agent", id: "agent-2" },
        { type: "provider", id: "provider-1" },
        { type: "provider", id: "provider-2" },
        { type: "model", id: "model-1" },
        { type: "model", id: "model-2" },
        { type: "knowledge_base", id: "kb-1" },
        { type: "skill", id: "skill-1" },
        { type: "custom_tool", id: "custom-tool-1" },
        { type: "mcp_server", id: "mcp-server-1" },
      ]),
    );
    expect(result).toHaveLength(10);
  });
});
