import { beforeEach,describe,expect,it,vi } from "vitest";

type Chain = Record<
  | "select"
  | "insert"
  | "from"
  | "innerJoin"
  | "where"
  | "orderBy"
  | "limit"
  | "values"
  | "onConflictDoUpdate"
  | "returning",
  ReturnType<typeof vi.fn>
>;

function makeChain(): Chain {
  const chain = {} as Chain;
  for (const key of ["select", "insert", "from", "innerJoin", "where", "orderBy", "values", "onConflictDoUpdate"] as const) {
    chain[key] = vi.fn().mockReturnThis();
  }
  chain.limit = vi.fn().mockResolvedValue([]);
  chain.returning = vi.fn().mockResolvedValue([]);
  return chain;
}

type DbModule = {
  db: {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    transaction: ReturnType<typeof vi.fn>;
  };
  _chain: Chain;
  _tx: Chain;
};

vi.mock("@/server/infrastructure/db", () => {
  const chain = makeChain();
  const tx = makeChain();
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      transaction: vi.fn(),
    },
    _chain: chain,
    _tx: tx,
  };
});
vi.mock("@/server/domain/services/authorization", () => ({
  authorization: { requireWorkspaceMember: vi.fn().mockResolvedValue(true) },
}));

import {
  forkSharedConversation,
  getConversationAccess,
  listConversationShares,
  upsertConversationShare,
} from "@/modules/chat/conversation-sharing";
import * as dbModuleImport from "@/server/infrastructure/db";
import { authorization } from "@/server/domain/services/authorization";

const dbModule = dbModuleImport as unknown as DbModule;
const now = new Date("2026-08-10T09:00:00.000Z");
const conversation = {
  id: "conversation-1",
  workspaceId: "workspace-1",
  agentId: "agent-1",
  agentVersionId: "version-1",
  userId: "owner-1",
  title: "Shared chat",
  status: "active",
  parentConversationId: null,
  archivedAt: null,
  expiresAt: null,
} as Parameters<typeof forkSharedConversation>[0];

function resetChain(chain: Chain) {
  for (const key of ["select", "insert", "from", "innerJoin", "where", "orderBy", "values", "onConflictDoUpdate"] as const) {
    chain[key].mockReset().mockReturnThis();
  }
  chain.limit.mockReset().mockResolvedValue([]);
  chain.returning.mockReset().mockResolvedValue([]);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  resetChain(dbModule._chain);
  resetChain(dbModule._tx);
  dbModule.db.select.mockReset().mockReturnValue(dbModule._chain);
  dbModule.db.insert.mockReset().mockReturnValue(dbModule._chain);
  dbModule.db.transaction.mockReset().mockImplementation((callback: (tx: Chain) => Promise<unknown>) => callback(dbModule._tx));
  vi.mocked(authorization.requireWorkspaceMember).mockResolvedValue(true);
});

describe("conversation sharing", () => {
  it("rejects missing and expired conversations", async () => {
    expect(await getConversationAccess("missing", "user-1")).toBeNull();
    dbModule._chain.limit.mockResolvedValueOnce([{ ...conversation, expiresAt: new Date("2026-08-10T08:59:59.000Z") }]);
    expect(await getConversationAccess("expired", "user-1")).toBeNull();
  });

  it("grants owners full shared access", async () => {
    dbModule._chain.limit.mockResolvedValueOnce([conversation]);
    await expect(getConversationAccess("conversation-1", "owner-1")).resolves.toMatchObject({
      role: "owner",
      canContinue: true,
      continuationMode: "shared",
    });
  });

  it("resolves recipient access and rejects users without a share", async () => {
    dbModule._chain.limit
      .mockResolvedValueOnce([conversation])
      .mockResolvedValueOnce([{ canContinue: true, continuationMode: "fork" }]);
    await expect(getConversationAccess("conversation-1", "recipient-1")).resolves.toMatchObject({
      role: "recipient",
      canContinue: true,
      continuationMode: "fork",
    });

    dbModule._chain.limit.mockResolvedValueOnce([conversation]).mockResolvedValueOnce([]);
    expect(await getConversationAccess("conversation-1", "stranger-1")).toBeNull();
  });

  it("lists shares through the ordered query", async () => {
    const shares = [{ id: "share-1", email: "member@example.test" }];
    dbModule._chain.orderBy.mockResolvedValueOnce(shares);
    await expect(listConversationShares("conversation-1", "owner-1")).resolves.toBe(shares);
  });

  it("creates or updates a share and forces fork mode without continuation", async () => {
    const target = { id: "recipient-1", name: "Recipient", email: "recipient@example.test" };
    dbModule._chain.limit.mockResolvedValueOnce([target]);
    dbModule._chain.returning.mockResolvedValueOnce([{ id: "share-1", continuationMode: "fork" }]);
    const result = await upsertConversationShare({
      conversation,
      ownerUserId: "owner-1",
      targetEmail: " RECIPIENT@EXAMPLE.TEST ",
      canContinue: false,
      continuationMode: "shared",
    });
    expect(result).toMatchObject({ id: "share-1", user: target });
    expect(dbModule._chain.values).toHaveBeenCalledWith(expect.objectContaining({ continuationMode: "fork" }));
    expect(dbModule._chain.onConflictDoUpdate).toHaveBeenCalledWith(expect.objectContaining({ set: expect.objectContaining({ continuationMode: "fork" }) }));
  });

  it("preserves the selected continuation mode when continuation is allowed", async () => {
    dbModule._chain.limit.mockResolvedValueOnce([{ id: "recipient-1", name: "Recipient", email: "recipient@example.test" }]);
    dbModule._chain.returning.mockResolvedValueOnce([{ id: "share-1" }]);
    await upsertConversationShare({ conversation, ownerUserId: "owner-1", targetEmail: "recipient@example.test", canContinue: true, continuationMode: "shared" });
    expect(dbModule._chain.values).toHaveBeenCalledWith(expect.objectContaining({ continuationMode: "shared" }));
  });

  it("rejects an email that is not an active workspace member", async () => {
    await expect(upsertConversationShare({ conversation, ownerUserId: "owner-1", targetEmail: "missing@example.test", canContinue: true, continuationMode: "fork" })).rejects.toThrow("Workspace member not found");
    dbModule._chain.limit.mockResolvedValueOnce([{ id: "inactive-1", name: "Inactive", email: "inactive@example.test" }]);
    vi.mocked(authorization.requireWorkspaceMember).mockResolvedValueOnce(false);
    await expect(upsertConversationShare({ conversation, ownerUserId: "owner-1", targetEmail: "inactive@example.test", canContinue: true, continuationMode: "fork" })).rejects.toThrow("Workspace member not found");
  });

  it("reuses an existing recipient fork", async () => {
    const existing = { ...conversation, id: "fork-1", userId: "recipient-1" };
    dbModule._chain.limit.mockResolvedValueOnce([existing]);
    await expect(forkSharedConversation(conversation, "recipient-1")).resolves.toBe(existing);
    expect(dbModule.db.transaction).not.toHaveBeenCalled();
  });

  it("copies messages and their parts into a new fork", async () => {
    const fork = { ...conversation, id: "fork-1", userId: "recipient-1" };
    const sourceMessage = { id: "message-1", role: "user", status: "completed", tokenInput: 2, tokenOutput: 0, costUsd: "0", modelId: null, providerId: null, createdAt: now, completedAt: now };
    const copiedMessage = { ...sourceMessage, id: "message-copy-1" };
    dbModule._tx.returning.mockResolvedValueOnce([fork]).mockResolvedValueOnce([copiedMessage]);
    dbModule._tx.orderBy
      .mockResolvedValueOnce([sourceMessage])
      .mockResolvedValueOnce([{ type: "text", contentEncrypted: "encrypted", metadataJson: null, sortOrder: 0, createdAt: now }]);
    await expect(forkSharedConversation(conversation, "recipient-1")).resolves.toBe(fork);
    expect(dbModule._tx.values).toHaveBeenLastCalledWith([expect.objectContaining({ messageId: "message-copy-1", type: "text" })]);
  });

  it("creates a fork without inserting parts when source messages have none", async () => {
    const fork = { ...conversation, id: "fork-1", userId: "recipient-1" };
    const sourceMessage = { id: "message-1", role: "assistant", status: "completed", createdAt: now };
    dbModule._tx.returning.mockResolvedValueOnce([fork]).mockResolvedValueOnce([{ id: "message-copy-1" }]);
    dbModule._tx.orderBy.mockResolvedValueOnce([sourceMessage]).mockResolvedValueOnce([]);
    await expect(forkSharedConversation(conversation, "recipient-1")).resolves.toBe(fork);
    expect(dbModule._tx.insert).toHaveBeenCalledTimes(2);
  });
});
