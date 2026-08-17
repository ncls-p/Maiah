import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  selectChain.from.mockReturnValue(selectChain);
  selectChain.where.mockReturnValue(selectChain);

  return {
    db: { select: vi.fn(() => selectChain) },
    selectChain,
    withPostgresAdvisoryLock: vi.fn(
      async (_key: string, callback: () => Promise<unknown>) => callback(),
    ),
  };
});

vi.mock("@/server/infrastructure/db", () => ({
  db: mocks.db,
  withPostgresAdvisoryLock: mocks.withPostgresAdvisoryLock,
}));

import {
  resolveConversationGraphRootId,
  withConversationGraphLock,
} from "@/modules/chat/conversation-graph-lock";

function queueRoot(rootId: string) {
  mocks.selectChain.limit
    .mockResolvedValueOnce([{ parentConversationId: rootId }])
    .mockResolvedValueOnce([{ parentConversationId: null }]);
}

describe("conversation graph locking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectChain.from.mockReturnValue(mocks.selectChain);
    mocks.selectChain.where.mockReturnValue(mocks.selectChain);
    mocks.withPostgresAdvisoryLock.mockImplementation(
      async (_key: string, callback: () => Promise<unknown>) => callback(),
    );
  });

  it("resolves a root and treats a missing conversation as its own root", async () => {
    queueRoot("root");
    mocks.selectChain.limit.mockResolvedValueOnce([]);

    await expect(resolveConversationGraphRootId("child")).resolves.toBe("root");
    await expect(resolveConversationGraphRootId("missing")).resolves.toBe(
      "missing",
    );
  });

  it("chooses a deterministic root for cycles and rejects excessive depth", async () => {
    mocks.selectChain.limit
      .mockResolvedValueOnce([{ parentConversationId: "conversation-b" }])
      .mockResolvedValueOnce([{ parentConversationId: "conversation-a" }]);

    await expect(
      resolveConversationGraphRootId("conversation-a"),
    ).resolves.toBe("conversation-a");

    for (let index = 1; index <= 64; index += 1) {
      mocks.selectChain.limit.mockResolvedValueOnce([
        { parentConversationId: `node-${String(index).padStart(3, "0")}` },
      ]);
    }
    await expect(resolveConversationGraphRootId("node-000")).rejects.toThrow(
      "Conversation graph exceeds the supported depth",
    );
  });

  it("runs the callback under the stable graph-root advisory lock", async () => {
    queueRoot("root");
    queueRoot("root");
    const callback = vi.fn(async () => "result");

    await expect(withConversationGraphLock("child", callback)).resolves.toBe(
      "result",
    );
    expect(mocks.withPostgresAdvisoryLock).toHaveBeenCalledOnce();
    expect(mocks.withPostgresAdvisoryLock).toHaveBeenCalledWith(
      "conversation-graph:root",
      expect.any(Function),
    );
    expect(callback).toHaveBeenCalledOnce();
  });

  it("retries with a newly discovered root before running the callback", async () => {
    queueRoot("root-a");
    queueRoot("root-b");
    queueRoot("root-b");
    const callback = vi.fn(async () => "stable");

    await expect(withConversationGraphLock("child", callback)).resolves.toBe(
      "stable",
    );
    expect(
      mocks.withPostgresAdvisoryLock.mock.calls.map(([key]) => key),
    ).toEqual(["conversation-graph:root-a", "conversation-graph:root-b"]);
    expect(callback).toHaveBeenCalledOnce();
  });

  it("fails closed when the graph root keeps changing", async () => {
    queueRoot("root-a");
    queueRoot("root-b");
    queueRoot("root-c");
    queueRoot("root-d");
    const callback = vi.fn(async () => "never");

    await expect(withConversationGraphLock("child", callback)).rejects.toThrow(
      "Conversation graph changed while acquiring its lock",
    );
    expect(callback).not.toHaveBeenCalled();
  });
});
