import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { GENESYS_REGIONS, GenesysError } from "./contracts";

export type GenesysCredentials = {
  region: string;
  clientId: string;
  clientSecret: string;
  integrationId: string;
};
export class GenesysHttpError extends GenesysError {
  constructor(
    public httpStatus: number,
    public uncertain: boolean,
  ) {
    super(
      uncertain ? "GENESYS_DELIVERY_UNCERTAIN" : "GENESYS_REQUEST_FAILED",
      502,
    );
  }
}
const participant = z.object({
  purpose: z.string(),
  state: z.string(),
  disconnectType: z.string().optional(),
  address: z.string().optional(),
  fromAddress: z
    .object({
      addressRaw: z.string().optional(),
      addressNormalized: z.string().optional(),
    })
    .optional(),
});
export const conversationResponse = z.object({
  id: z.uuid(),
  participants: z.array(participant),
});
export function remoteState(value: z.infer<typeof conversationResponse>) {
  const live = value.participants.filter(
    (p) => !["disconnected", "terminated"].includes(p.state),
  );
  if (live.some((p) => p.purpose === "agent" && p.state === "connected"))
    return "human";
  if (value.participants.length && live.length === 0) return "completed";
  return "waiting";
}
export function verifySignature(
  body: string,
  signature: string | null,
  secret: string,
) {
  if (!signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}
export function inboundMessage(
  sessionId: string,
  messageId: string,
  text: string,
  createdAt: Date,
) {
  return {
    channel: {
      from: { id: sessionId, idType: "Opaque" },
      time: createdAt.toISOString(),
      messageId,
    },
    text,
  };
}
export async function genesysClient(
  credentials: GenesysCredentials,
  transport: typeof fetch = fetch,
) {
  if (!(GENESYS_REGIONS as readonly string[]).includes(credentials.region))
    throw new GenesysError("GENESYS_INVALID_REGION", 400);
  const tokenResponse = await transport(
    `https://login.${credentials.region}/oauth/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    },
  );
  if (!tokenResponse.ok)
    throw new GenesysHttpError(tokenResponse.status, false);
  const { access_token } = z
    .object({ access_token: z.string().min(1) })
    .parse(await tokenResponse.json());
  async function request(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await transport(
        `https://api.${credentials.region}/api/v2/${path}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${access_token}`,
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
          redirect: "error",
        },
      );
    } catch {
      throw new GenesysHttpError(0, method !== "GET");
    }
    if (!response.ok)
      throw new GenesysHttpError(
        response.status,
        method !== "GET" && (response.status >= 500 || response.status === 408),
      );
    if (response.status === 204) return {};
    try {
      return await response.json();
    } catch {
      throw new GenesysHttpError(response.status, method !== "GET");
    }
  }
  return {
    integration: () =>
      request(
        `conversations/messaging/integrations/open/${credentials.integrationId}`,
      ),
    send: (body: ReturnType<typeof inboundMessage>) =>
      request(
        `conversations/messages/${credentials.integrationId}/inbound/open/message?prefetchConversationId=true`,
        "POST",
        body,
      ),
    conversation: async (id: string) =>
      conversationResponse.parse(
        await request(`conversations/messages/${z.uuid().parse(id)}`),
      ),
    disconnect: (id: string) =>
      request(`conversations/messages/${z.uuid().parse(id)}`, "PATCH", {
        state: "disconnected",
      }),
  };
}
