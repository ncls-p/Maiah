import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  genesysClient,
  inboundMessage,
  remoteState,
  verifySignature,
} from "@/modules/genesys/client";
import {
  connectionInput,
  handoffInput,
  HANDOFF_TOOL,
} from "@/modules/genesys/contracts";
import { genesysResponse } from "@/modules/genesys/route-response";
import { GenesysError } from "@/modules/genesys/contracts";
const id = "00000000-0000-4000-8000-000000000001";
const credentials = {
  region: "mypurecloud.ie",
  clientId: id,
  integrationId: id,
  clientSecret: "secret",
};
describe("Genesys Open Messaging contract", () => {
  it("validates exact signed bytes and rejects malformed/tampered signatures", () => {
    const body = '{"text":"bonjour"}';
    const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
    expect(verifySignature(body, signature, "secret")).toBe(true);
    for (const invalid of [
      null,
      "",
      "sha256=no",
      signature.replace("sha256", "sha1"),
    ])
      expect(verifySignature(body, invalid, "secret")).toBe(false);
    expect(verifySignature(body + " ", signature, "secret")).toBe(false);
  });
  it("distinguishes a connected agent, a waiting transfer and complete disconnection", () => {
    expect(remoteState({ id, participants: [] })).toBe("waiting");
    expect(
      remoteState({
        id,
        participants: [
          { purpose: "agent", state: "alerting" },
          { purpose: "customer", state: "connected" },
        ],
      }),
    ).toBe("waiting");
    expect(
      remoteState({
        id,
        participants: [{ purpose: "agent", state: "connected" }],
      }),
    ).toBe("human");
    expect(
      remoteState({
        id,
        participants: [
          {
            purpose: "agent",
            state: "disconnected",
            disconnectType: "transfer",
          },
          { purpose: "acd", state: "connected" },
        ],
      }),
    ).toBe("waiting");
    expect(
      remoteState({
        id,
        participants: [
          { purpose: "agent", state: "disconnected" },
          { purpose: "customer", state: "terminated" },
        ],
      }),
    ).toBe("completed");
  });
  it("uses the current per-integration contract and requests conversation prefetch", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: "private-token" }))
      .mockResolvedValueOnce(
        Response.json({ id: "message", conversationId: id }),
      );
    const client = await genesysClient(credentials, transport);
    const body = inboundMessage(
      id,
      "message",
      "hello",
      new Date("2026-09-15T00:00:00Z"),
    );
    await client.send(body);
    expect(transport.mock.calls[0][0]).toBe(
      "https://login.mypurecloud.ie/oauth/token",
    );
    expect(transport.mock.calls[1][0]).toBe(
      `https://api.mypurecloud.ie/api/v2/conversations/messages/${id}/inbound/open/message?prefetchConversationId=true`,
    );
    expect(JSON.parse(transport.mock.calls[1][1]!.body as string)).toEqual({
      channel: {
        from: { id, idType: "Opaque" },
        messageId: "message",
        time: "2026-09-15T00:00:00.000Z",
      },
      text: "hello",
    });
    expect(transport.mock.calls[1][1]!.redirect).toBe("error");
  });
  it.each([400, 401, 403, 429, 500, 503, 408])(
    "classifies HTTP %i without leaking upstream content",
    async (status) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json({ access_token: "token" }))
        .mockResolvedValueOnce(new Response("private error", { status }));
      const client = await genesysClient(credentials, transport);
      await expect(
        client.send(inboundMessage(id, id, "hi", new Date())),
      ).rejects.toMatchObject({
        uncertain: status >= 500 || status === 408,
        httpStatus: status,
      });
    },
  );
  it("does not mistake a network or malformed success response for known rejection", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: "token" }))
      .mockRejectedValueOnce(new Error("network"));
    const client = await genesysClient(credentials, transport);
    await expect(
      client.send(inboundMessage(id, id, "hi", new Date())),
    ).rejects.toMatchObject({ uncertain: true });
    transport.mockResolvedValueOnce(new Response("broken", { status: 202 }));
    await expect(
      client.send(inboundMessage(id, id, "hi", new Date())),
    ).rejects.toMatchObject({ uncertain: true });
    transport.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(client.disconnect(id)).resolves.toEqual({});
  });
  it("rejects arbitrary hosts and OAuth failure before sending a message", async () => {
    const transport = vi.fn<typeof fetch>();
    await expect(
      genesysClient({ ...credentials, region: "localhost" }, transport),
    ).rejects.toMatchObject({ code: "GENESYS_INVALID_REGION" });
    expect(transport).not.toHaveBeenCalled();
    transport.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(genesysClient(credentials, transport)).rejects.toMatchObject({
      uncertain: false,
    });
  });
  it("validates configuration and bounds model payloads", () => {
    expect(
      connectionInput.safeParse({
        ...credentials,
        label: "Support",
        clientSecret: "secret",
        webhookSecret: "x".repeat(32),
        projectIds: [id],
        enabled: true,
      }).success,
    ).toBe(true);
    expect(handoffInput.safeParse({ reason: "", summary: "x" }).success).toBe(
      false,
    );
    expect(
      handoffInput.safeParse({ reason: "help", summary: "x".repeat(3001) })
        .success,
    ).toBe(false);
    expect(HANDOFF_TOOL.id).toMatch(/^[\da-f-]{36}$/);
  });
  it("returns safe typed route errors", async () => {
    expect(
      (
        await genesysResponse(async () => {
          throw new GenesysError("FORBIDDEN", 403);
        })
      ).status,
    ).toBe(403);
    expect(
      (await genesysResponse(async () => handoffInput.parse({}))).status,
    ).toBe(400);
    expect(
      (
        await genesysResponse(async () => {
          throw new SyntaxError();
        })
      ).status,
    ).toBe(400);
    const response = await genesysResponse(async () => {
      throw new Error("secret");
    });
    expect(await response.text()).not.toContain("secret");
    expect((await genesysResponse(async () => ({ ok: true }))).status).toBe(
      200,
    );
  });
});
