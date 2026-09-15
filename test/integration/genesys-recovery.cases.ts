import { it, expect } from "vitest";
import { randomUUID, createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  conversations,
  conversationShares,
  genesysConnections,
  genesysDeliveries,
  workspaces,
} from "@/server/infrastructure/db/schema";
import {
  saveConnection,
  testConnection,
  projectConnection,
} from "@/modules/genesys/connections";
import {
  requestHandoff,
  resumeAi,
  currentHandoff,
  handoffView,
} from "@/modules/genesys/sessions";
import {
  listConnectionSessions,
  reconcileSession,
} from "@/modules/genesys/reconciliation";
import { receiveGenesysWebhook } from "@/modules/genesys/webhook";
import { drainGenesys } from "@/modules/genesys/worker";
import type { createSharingFixture } from "./resource-sharing-db.fixture";
type Context = {
  f: Awaited<ReturnType<typeof createSharingFixture>>;
  state: {
    remote: string;
    remoteAddress: string;
    authFails: boolean;
    statusFails: boolean;
    sendStatus: number;
    sendCount: number;
  };
  savedInput: unknown;
  connectionId: string;
  externalId: string;
  integrationId: string;
  signatureSecret: string;
  webhookUrl: string;
  newConversation: () => Promise<string>;
};
export function registerGenesysRecoveryCases(getContext: () => Context) {
  it("lets transcript recipients read an inactive handoff view without granting mutations", async () => {
    const { f, newConversation } = getContext();
    const id = await newConversation();
    await db.insert(conversationShares).values({
      conversationId: id,
      sharedByUserId: f.owner,
      sharedWithUserId: f.member,
      canContinue: false,
      continuationMode: "fork",
    });
    expect(await handoffView(f.member, id)).toEqual({
      available: false,
      session: null,
    });
    await expect(
      requestHandoff(f.member, id, { reason: "help", summary: "context" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(handoffView(randomUUID(), id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
  it("never automatically replays an ambiguous external effect", async () => {
    const { f, state, externalId, newConversation } = getContext();
    const id = await newConversation();
    state.sendStatus = 503;
    const { handoffId } = await requestHandoff(f.owner, id, {
      reason: "help",
      summary: "context",
    });
    const before = state.sendCount;
    await drainGenesys();
    await drainGenesys();
    expect(state.sendCount).toBe(before + 1);
    expect((await currentHandoff(id))?.state).toBe("uncertain");
    await expect(resumeAi(f.owner, id)).rejects.toMatchObject({
      code: "GENESYS_RECONCILIATION_REQUIRED",
    });
    expect(
      (await listConnectionSessions(f.organizationId)).some(
        (row) => row.id === handoffId,
      ),
    ).toBe(true);
    await expect(
      reconcileSession(f.outsider, f.organizationId, handoffId, externalId),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      reconcileSession(f.owner, f.organizationId, randomUUID(), externalId),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      reconcileSession(f.owner, f.organizationId, handoffId, externalId),
    ).rejects.toMatchObject({ code: "GENESYS_CONVERSATION_MISMATCH" });
    state.remoteAddress = handoffId;
    await reconcileSession(f.owner, f.organizationId, handoffId, externalId);
    await expect(
      reconcileSession(f.owner, f.organizationId, handoffId, externalId),
    ).rejects.toMatchObject({ code: "GENESYS_RECONCILIATION_NOT_REQUIRED" });
    state.sendStatus = 202;
    await drainGenesys();
    state.remote = "waiting";
  });
  it("allows safe resumption after known rejection without replay", async () => {
    const { f, state, newConversation } = getContext();
    const id = await newConversation();
    state.sendStatus = 403;
    await requestHandoff(f.owner, id, { reason: "help", summary: "context" });
    await drainGenesys();
    expect((await currentHandoff(id))?.state).toBe("failed");
    expect((await handoffView(f.owner, id)).session?.deliveryFailed).toBe(1);
    await resumeAi(f.owner, id);
    state.sendStatus = 202;
    expect(await currentHandoff(id)).toBeNull();
  });
  it("keeps failed authentication and status reads recoverable without replaying messages", async () => {
    const { f, state, newConversation } = getContext();
    const id = await newConversation();
    await requestHandoff(f.owner, id, { reason: "help", summary: "context" });
    const before = state.sendCount;
    state.authFails = true;
    await drainGenesys();
    expect(state.sendCount).toBe(before);
    expect((await currentHandoff(id))?.errorCode).toBe(
      "GENESYS_CONNECTION_FAILED",
    );
    state.authFails = false;
    await drainGenesys();
    state.statusFails = true;
    await drainGenesys();
    expect((await currentHandoff(id))?.errorCode).toBe(
      "GENESYS_STATUS_UNAVAILABLE",
    );
    state.statusFails = false;
    await resumeAi(f.owner, id);
    await drainGenesys();
    state.remote = "waiting";
  });
  it("reaps a claimed delivery after a sender crash and never sends it again", async () => {
    const { f, state, externalId, newConversation } = getContext();
    const id = await newConversation();
    const { handoffId } = await requestHandoff(f.owner, id, {
      reason: "help",
      summary: "context",
    });
    await db
      .update(genesysDeliveries)
      .set({ state: "sending", updatedAt: new Date(Date.now() - 180_000) })
      .where(eq(genesysDeliveries.sessionId, handoffId));
    const before = state.sendCount;
    await drainGenesys();
    expect(state.sendCount).toBe(before);
    expect((await currentHandoff(id))?.state).toBe("uncertain");
    state.remoteAddress = handoffId;
    await reconcileSession(f.owner, f.organizationId, handoffId, externalId);
    await drainGenesys();
    state.remote = "waiting";
  });
  it("closes archived conversations and rejects invalid signed messages", async () => {
    const { f, connectionId, integrationId, signatureSecret, newConversation } =
      getContext();
    const id = await newConversation();
    const { handoffId } = await requestHandoff(f.owner, id, {
      reason: "help",
      summary: "context",
    });
    await db
      .update(conversations)
      .set({ status: "archived" })
      .where(eq(conversations.id, id));
    await drainGenesys();
    expect(await currentHandoff(id)).toBeNull();
    const sign = (body: string) =>
      `sha256=${createHmac("sha256", signatureSecret).update(body).digest("hex")}`;
    for (const body of [
      "broken",
      JSON.stringify({
        id: "x",
        type: "Text",
        text: "",
        channel: { id: integrationId, to: { id: handoffId } },
      }),
      JSON.stringify({
        id: "x",
        type: "Text",
        text: "hello",
        channel: { id: randomUUID(), to: { id: handoffId } },
      }),
    ]) {
      await expect(
        receiveGenesysWebhook(connectionId, body, sign(body)),
      ).rejects.toMatchObject({ status: expect.any(Number) });
    }
    const receipt = JSON.stringify({
      id: "r",
      type: "Receipt",
      channel: { id: integrationId, to: { id: handoffId } },
    });
    await receiveGenesysWebhook(connectionId, receipt, sign(receipt));
  });
  it("validates grant ownership and supports credential rotation after failed validation", async () => {
    const { f, state, savedInput, webhookUrl } = getContext();
    await expect(
      saveConnection(f.owner, f.organizationId, {
        ...(savedInput as object),
        projectIds: [randomUUID()],
      }),
    ).rejects.toMatchObject({ code: "GENESYS_PROJECT_FORBIDDEN" });
    state.authFails = true;
    expect(
      (await testConnection(f.owner, f.organizationId, webhookUrl)).ok,
    ).toBe(false);
    state.authFails = false;
    await saveConnection(f.owner, f.organizationId, {
      ...(savedInput as object),
      clientSecret: undefined,
      webhookSecret: undefined,
    });
    expect(
      (await testConnection(f.owner, f.organizationId, webhookUrl)).ok,
    ).toBe(true);
  });
  it("disables handoff for disabled connections and ephemeral conversations", async () => {
    const { f, connectionId, newConversation } = getContext();
    await db
      .update(genesysConnections)
      .set({ enabled: false })
      .where(eq(genesysConnections.id, connectionId));
    expect(await projectConnection(f.workspaceId)).toBeNull();
    await db
      .update(genesysConnections)
      .set({ enabled: true })
      .where(eq(genesysConnections.id, connectionId));
    const id = await newConversation();
    await db
      .update(conversations)
      .set({ isEphemeral: true })
      .where(eq(conversations.id, id));
    expect((await handoffView(f.owner, id)).available).toBe(false);
    expect(
      await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, f.workspaceId)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(genesysDeliveries)
        .where(
          and(
            eq(genesysDeliveries.direction, "inbound"),
            eq(genesysDeliveries.state, "sending"),
          ),
        ),
    ).toHaveLength(0);
  });
}
