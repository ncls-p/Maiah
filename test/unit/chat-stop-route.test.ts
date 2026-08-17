import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const messageSelect = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  messageSelect.from.mockReturnValue(messageSelect);
  messageSelect.where.mockReturnValue(messageSelect);
  messageSelect.orderBy.mockReturnValue(messageSelect);

  const runSelect = {
    from: vi.fn(),
    where: vi.fn(),
  };
  runSelect.from.mockReturnValue(runSelect);

  const cancelledUpdate = {
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn(),
  };
  cancelledUpdate.set.mockReturnValue(cancelledUpdate);
  cancelledUpdate.where.mockReturnValue(cancelledUpdate);

  const conversationUpdate = {
    set: vi.fn(),
    where: vi.fn(),
  };
  conversationUpdate.set.mockReturnValue(conversationUpdate);

  const tx = { update: vi.fn() };
  const db = {
    select: vi.fn(),
    transaction: vi.fn(
      async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
    ),
  };

  return {
    abortChatStream: vi.fn(),
    cancelledUpdate,
    conversationUpdate,
    createChatStreamResponse: vi.fn(),
    db,
    getAuthorizedConversation: vi.fn(),
    hasActiveChatStream: vi.fn(),
    messageSelect,
    reapExpiredChatStreams: vi.fn(),
    requestAgentRunCancellation: vi.fn(),
    runSelect,
    tx,
  };
});

vi.mock("@/lib/route-handler", () => ({
  handleRoute: async (
    request: Request,
    handler: (context: {
      session: { user: { id: string } };
      request: Request;
    }) => Promise<Response>,
  ) =>
    handler({
      session: { user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } },
      request,
    }),
}));

vi.mock("@/modules/agent/run-use-cases", () => ({
  requestAgentRunCancellation: mocks.requestAgentRunCancellation,
}));

vi.mock("@/modules/chat/chat-stream-lease", () => ({
  chatStreamIdempotencyKey: (messageId: string, generationId: string) =>
    `chat:${messageId}:${generationId}`,
  reapExpiredChatStreams: mocks.reapExpiredChatStreams,
}));

vi.mock("@/modules/chat/stream-bus", () => ({
  abortChatStream: mocks.abortChatStream,
  createChatStreamResponse: mocks.createChatStreamResponse,
  hasActiveChatStream: mocks.hasActiveChatStream,
}));

vi.mock("@/server/infrastructure/db", () => ({ db: mocks.db }));

vi.mock(
  "@/app/api/workspace/conversations/[conversationId]/conversation-route-access",
  () => ({
    getAuthorizedConversation: mocks.getAuthorizedConversation,
  }),
);

import { POST } from "@/app/api/workspace/conversations/[conversationId]/stop/route";
import { GET as resumeStream } from "@/app/api/workspace/conversations/[conversationId]/stream/route";

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
const MESSAGE_ID = "22222222-2222-4222-8222-222222222222";
const GENERATION_ID = "33333333-3333-4333-8333-333333333333";
const RUN_ID = "44444444-4444-4444-8444-444444444444";
const params = { params: Promise.resolve({ conversationId: CONVERSATION_ID }) };

function request(body: Record<string, string> = {}) {
  return new Request(
    `http://localhost/api/workspace/conversations/${CONVERSATION_ID}/stop`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  ) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.select.mockReset();
  mocks.tx.update.mockReset();
  mocks.messageSelect.from.mockReturnValue(mocks.messageSelect);
  mocks.messageSelect.where.mockReturnValue(mocks.messageSelect);
  mocks.messageSelect.orderBy.mockReturnValue(mocks.messageSelect);
  mocks.runSelect.from.mockReturnValue(mocks.runSelect);
  mocks.cancelledUpdate.set.mockReturnValue(mocks.cancelledUpdate);
  mocks.cancelledUpdate.where.mockReturnValue(mocks.cancelledUpdate);
  mocks.conversationUpdate.set.mockReturnValue(mocks.conversationUpdate);
  mocks.conversationUpdate.where.mockResolvedValue(undefined);
  mocks.tx.update
    .mockReturnValueOnce(mocks.cancelledUpdate)
    .mockReturnValueOnce(mocks.conversationUpdate);
  mocks.db.select
    .mockReturnValueOnce(mocks.messageSelect)
    .mockReturnValueOnce(mocks.runSelect);
  mocks.getAuthorizedConversation.mockResolvedValue({
    ok: true,
    conversationId: CONVERSATION_ID,
    access: { role: "owner" },
  });
  mocks.abortChatStream.mockReturnValue(true);
  mocks.reapExpiredChatStreams.mockResolvedValue([]);
  mocks.requestAgentRunCancellation.mockResolvedValue(undefined);
  mocks.cancelledUpdate.returning.mockResolvedValue([{ id: MESSAGE_ID }]);
  mocks.runSelect.where.mockResolvedValue([]);
});

describe("chat stream legacy rollout", () => {
  it("keeps a leased legacy producer pollable until it finishes or expires", async () => {
    mocks.db.select.mockReset().mockReturnValueOnce(mocks.messageSelect);
    mocks.messageSelect.limit.mockResolvedValueOnce([
      { id: MESSAGE_ID, generationId: null },
    ]);

    const response = await resumeStream(
      new Request(
        `http://localhost/api/workspace/conversations/${CONVERSATION_ID}/stream`,
      ) as never,
      params,
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      active: true,
      legacy: true,
      retryAfterMs: 2_000,
      messageId: MESSAGE_ID,
    });
    expect(mocks.reapExpiredChatStreams).toHaveBeenCalledWith(
      expect.any(Date),
      [MESSAGE_ID],
    );
  });
});

describe("chat stop route generation fencing", () => {
  it("cancels only the modern message generation and its exact agent run", async () => {
    mocks.messageSelect.limit.mockResolvedValueOnce([
      { id: MESSAGE_ID, generationId: GENERATION_ID },
    ]);
    mocks.runSelect.where.mockResolvedValueOnce([{ id: RUN_ID }]);

    const response = await POST(
      request({ messageId: MESSAGE_ID, generationId: GENERATION_ID }),
      params,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      stopped: true,
      messageId: MESSAGE_ID,
    });
    expect(mocks.abortChatStream).toHaveBeenCalledWith(
      MESSAGE_ID,
      GENERATION_ID,
    );
    expect(mocks.requestAgentRunCancellation).toHaveBeenCalledWith(
      RUN_ID,
      expect.any(Date),
    );

    const messagePredicate = mocks.messageSelect.where.mock.calls[0]?.[0] as SQL;
    const messageQuery = new PgDialect().sqlToQuery(messagePredicate);
    expect(messageQuery.params).toEqual(
      expect.arrayContaining([CONVERSATION_ID, MESSAGE_ID, GENERATION_ID]),
    );

    const runPredicate = mocks.runSelect.where.mock.calls[0]?.[0] as SQL;
    const runQuery = new PgDialect().sqlToQuery(runPredicate);
    expect(runQuery.params).toContain(
      `chat:${MESSAGE_ID}:${GENERATION_ID}`,
    );
  });

  it("does not fall back from a stale modern identity to another stream", async () => {
    mocks.messageSelect.limit.mockResolvedValueOnce([]);

    const response = await POST(
      request({ messageId: MESSAGE_ID, generationId: GENERATION_ID }),
      params,
    );

    await expect(response.json()).resolves.toEqual({ stopped: false });
    expect(mocks.db.transaction).not.toHaveBeenCalled();
    expect(mocks.abortChatStream).not.toHaveBeenCalled();
  });

  it("keeps the unscoped fallback restricted to legacy NULL generations", async () => {
    mocks.messageSelect.limit.mockResolvedValueOnce([
      { id: MESSAGE_ID, generationId: null },
    ]);

    const response = await POST(request(), params);

    expect(response.status).toBe(200);
    const messagePredicate = mocks.messageSelect.where.mock.calls[0]?.[0] as SQL;
    const messageQuery = new PgDialect().sqlToQuery(messagePredicate);
    expect(messageQuery.sql).toContain('"stream_generation_id" is null');
    expect(mocks.abortChatStream).not.toHaveBeenCalled();

    const runPredicate = mocks.runSelect.where.mock.calls[0]?.[0] as SQL;
    const runQuery = new PgDialect().sqlToQuery(runPredicate);
    expect(runQuery.sql).toContain('"created_at" <=');
  });
});
