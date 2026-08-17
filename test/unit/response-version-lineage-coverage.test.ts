import { beforeEach, describe, expect, it, vi } from "vitest";

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
    db: { select: vi.fn(() => chain) },
  };
});

vi.mock("@/server/infrastructure/db", () => ({ db: mocks.db }));

import { resolveResponseVersionRootId } from "@/modules/chat/response-version-lineage";

describe("response-version lineage safety bounds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.chain.from.mockReturnValue(mocks.chain);
    mocks.chain.where.mockReturnValue(mocks.chain);
  });

  it("rejects a cyclic lineage instead of looping forever", async () => {
    mocks.chain.limit.mockResolvedValueOnce([
      {
        id: "version-a",
        parentConversationId: "version-b",
        branchKind: "response_version",
      },
    ]);

    await expect(
      resolveResponseVersionRootId({
        id: "version-a",
        parentConversationId: "version-b",
        branchKind: "response_version",
      }),
    ).rejects.toThrow("lineage contains a cycle");
  });

  it("rejects a lineage deeper than the supported safety bound", async () => {
    let depth = 1;
    mocks.chain.limit.mockImplementation(async () => {
      const id = `version-${depth}`;
      depth += 1;
      return [
        {
          id,
          parentConversationId: `version-${depth}`,
          branchKind: "response_version",
        },
      ];
    });

    await expect(
      resolveResponseVersionRootId({
        id: "version-0",
        parentConversationId: "version-1",
        branchKind: "response_version",
      }),
    ).rejects.toThrow("lineage exceeds the supported depth");
    expect(mocks.chain.limit).toHaveBeenCalledTimes(64);
  });
});
