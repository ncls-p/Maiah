import { registerGenesysRecoveryCases } from "./genesys-recovery.cases";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createHmac, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  agentToolBindings,
  conversations,
  messages,
  messageParts,
} from "@/server/infrastructure/db/schema";
import { createSharingFixture } from "./resource-sharing-db.fixture";
import {
  saveConnection,
  connectionView,
  testConnection,
  projectConnection,
} from "@/modules/genesys/connections";
import {
  currentHandoff,
  handoffView,
  requestHandoff,
  resumeAi,
  sendHumanMessage,
} from "@/modules/genesys/sessions";
import { HANDOFF_TOOL } from "@/modules/genesys/contracts";
import { drainGenesys } from "@/modules/genesys/worker";
import { receiveGenesysWebhook } from "@/modules/genesys/webhook";
import { getConversationMessages } from "@/modules/agent/use-cases";
const suite = process.env.IAM_INTEGRATION_DATABASE_URL
  ? describe.sequential
  : describe.skip;
suite("Genesys handoff with PostgreSQL and simulated Genesys HTTP", () => {
  let f: Awaited<ReturnType<typeof createSharingFixture>>;
  let agent: Awaited<ReturnType<typeof f.makeAgent>>;
  let connectionId: string;
  const integrationId = randomUUID(),
    externalId = randomUUID(),
    signatureSecret = "test-webhook-signature-secret-32-chars";
  const state = {
    remote: "waiting",
    remoteAddress: "",
    authFails: false,
    statusFails: false,
    sendStatus: 202,
    sendCount: 0,
  };
  let savedInput: Parameters<typeof saveConnection>[2];
  const conversationIds: string[] = [];
  const webhookUrl = "https://maiah.example/api/genesys";
  async function newConversation() {
    const [conversation] = await db
      .insert(conversations)
      .values({
        workspaceId: f.workspaceId,
        agentId: agent.agent.id,
        userId: f.owner,
        title: "Genesys test",
      })
      .returning();
    conversationIds.push(conversation.id);
    return conversation.id;
  }
  beforeAll(async () => {
    f = await createSharingFixture();
    agent = await f.makeAgent("Genesys assistant");
    await db.insert(agentToolBindings).values({
      agentVersionId: agent.version.id,
      toolSource: "builtin",
      toolId: HANDOFF_TOOL.id,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options?: RequestInit) => {
        if (url.includes("oauth/token")) {
          if (state.authFails) return new Response(null, { status: 401 });
          return Response.json({ access_token: "never-display-token" });
        }
        if (url.includes("integrations/open"))
          return Response.json({
            id: integrationId,
            outboundNotificationWebhookUrl: webhookUrl,
            outboundNotificationWebhookSignatureSecretToken: signatureSecret,
          });
        if (url.includes("inbound/open/message")) {
          state.sendCount++;
          if (state.sendStatus !== 202)
            return new Response("upstream-private-error", {
              status: state.sendStatus,
            });
          const body = JSON.parse(options!.body as string);
          return Response.json(
            {
              id: `external-${body.channel.messageId}`,
              conversationId: externalId,
            },
            { status: 202 },
          );
        }
        if (options?.method === "PATCH") {
          state.remote = "completed";
          return Response.json({});
        }
        if (state.statusFails) return new Response(null, { status: 503 });
        return Response.json({
          id: externalId,
          participants: [
            {
              purpose: "customer",
              address: state.remoteAddress,
              state:
                state.remote === "completed" ? "disconnected" : "connected",
            },
            ...(state.remote === "human"
              ? [{ purpose: "agent", state: "connected" }]
              : []),
          ],
        });
      }),
    );
    savedInput = {
      label: "Support",
      region: "mypurecloud.ie",
      integrationId,
      clientId: randomUUID(),
      clientSecret: "oauth-secret",
      webhookSecret: signatureSecret,
      projectIds: [f.workspaceId],
      enabled: true,
    };
    const saved = await saveConnection(f.owner, f.organizationId, savedInput);
    connectionId = saved!.id;
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    if (!f) return;
    if (conversationIds.length) {
      const rows = await db
        .select({ id: messages.id })
        .from(messages)
        .where(inArray(messages.conversationId, conversationIds));
      if (rows.length)
        await db.delete(messageParts).where(
          inArray(
            messageParts.messageId,
            rows.map((r) => r.id),
          ),
        );
      await db
        .delete(messages)
        .where(inArray(messages.conversationId, conversationIds));
      await db
        .delete(conversations)
        .where(inArray(conversations.id, conversationIds));
    }
    await f.cleanup();
  });
  it("requires organization permission and never exposes stored secrets", async () => {
    await expect(
      saveConnection(f.outsider, f.organizationId, savedInput),
    ).rejects.toMatchObject({ status: 403 });
    const view = await connectionView(f.organizationId);
    expect(JSON.stringify(view)).not.toMatch(
      /oauth-secret|encryptedSecrets|test-webhook-signature/,
    );
    expect(await projectConnection(f.workspaceId)).toBeNull();
    expect(
      await testConnection(f.owner, f.organizationId, "https://wrong.example"),
    ).toEqual({ ok: false, errorCode: "GENESYS_WEBHOOK_MISMATCH" });
    expect(await testConnection(f.owner, f.organizationId, webhookUrl)).toEqual(
      { ok: true, errorCode: null },
    );
    expect(await projectConnection(f.destinationId)).toBeNull();
    expect(await projectConnection(f.workspaceId)).not.toBeNull();
  });
  it("makes concurrent handoff requests idempotent and blocks AI admission", async () => {
    const id = await newConversation();
    const results = await Promise.all([
      requestHandoff(f.owner, id, { reason: "help", summary: "context" }),
      requestHandoff(f.owner, id, { reason: "help", summary: "context" }),
    ]);
    expect(results[0].handoffId).toBe(results[1].handoffId);
    await expect(
      db
        .insert(messages)
        .values({ conversationId: id, role: "assistant", status: "streaming" }),
    ).rejects.toThrow();
    expect((await handoffView(f.owner, id)).session?.state).toBe("requested");
    await expect(
      requestHandoff(f.outsider, id, { reason: "help", summary: "context" }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      saveConnection(f.owner, f.organizationId, {
        ...(savedInput as object),
        integrationId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "GENESYS_CONNECTION_IN_USE" });
    await resumeAi(f.owner, id);
    expect(await currentHandoff(id)).toBeNull();
  });
  it("requires stopping an in-flight AI unless the request is its own tool call", async () => {
    const id = await newConversation();
    const [message] = await db
      .insert(messages)
      .values({ conversationId: id, role: "assistant", status: "streaming" })
      .returning();
    await expect(
      requestHandoff(f.owner, id, { reason: "help", summary: "context" }),
    ).rejects.toMatchObject({ code: "GENESYS_STOP_AI_FIRST" });
    await expect(
      requestHandoff(
        f.owner,
        id,
        { reason: "help", summary: "context" },
        message.id,
      ),
    ).resolves.toMatchObject({ accepted: true });
    await db
      .update(messages)
      .set({ status: "completed" })
      .where(eq(messages.id, message.id));
    await resumeAi(f.owner, id);
  });
  it("relays messages both ways, deduplicates webhook retries and closes before resuming AI", async () => {
    const id = await newConversation();
    const { handoffId } = await requestHandoff(f.owner, id, {
      reason: "help",
      summary: "context",
    });
    const before = state.sendCount;
    await drainGenesys();
    expect(state.sendCount).toBe(before + 1);
    expect((await currentHandoff(id))?.externalConversationId).toBe(externalId);
    const messageId = randomUUID();
    await Promise.all([
      sendHumanMessage(f.owner, id, messageId, "Customer message"),
      sendHumanMessage(f.owner, id, messageId, "Customer message"),
    ]);
    await drainGenesys();
    expect(state.sendCount).toBe(before + 2);
    state.remote = "human";
    await drainGenesys();
    expect((await currentHandoff(id))?.state).toBe("human");
    const body = JSON.stringify({
      id: "reply-1",
      type: "Text",
      text: "Bonjour, comment puis-je vous aider ?",
      direction: "Outbound",
      channel: { id: integrationId, to: { id: handoffId } },
    });
    const signature = `sha256=${createHmac("sha256", signatureSecret).update(body).digest("hex")}`;
    await expect(
      receiveGenesysWebhook(connectionId, body, "bad"),
    ).rejects.toMatchObject({ status: 401 });
    await Promise.all([
      receiveGenesysWebhook(connectionId, body, signature),
      receiveGenesysWebhook(connectionId, body, signature),
    ]);
    const history = await getConversationMessages(id);
    expect(history).toHaveLength(2);
    expect(history[1].parts[0].content).toContain("Support Genesys");
    expect(history[1].parts[0].content).toContain("Bonjour");
    await resumeAi(f.owner, id);
    expect((await currentHandoff(id))?.state).toBe("closing");
    await drainGenesys();
    expect(await currentHandoff(id)).toBeNull();
    await receiveGenesysWebhook(
      connectionId,
      body.replace("reply-1", "reply-late"),
      `sha256=${createHmac("sha256", signatureSecret).update(body.replace("reply-1", "reply-late")).digest("hex")}`,
    );
    expect(await getConversationMessages(id)).toHaveLength(2);
    state.remote = "waiting";
  });
  registerGenesysRecoveryCases(() => ({
    f,
    state,
    savedInput,
    connectionId,
    externalId,
    integrationId,
    signatureSecret,
    webhookUrl,
    newConversation,
  }));
});
