import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { microsoftTokenFixture } from "../fixtures/microsoft-token";
import { eq, inArray } from "drizzle-orm";
vi.mock("server-only", () => ({}));
vi.mock("better-auth/next-js", () => ({
  nextCookies: () => ({ id: "test-next-cookies" }),
}));
import { db } from "@/server/infrastructure/db";
import {
  users,
  accounts,
  organizations,
  organizationMembers,
  appSettings,
  verifications,
  auditEvents,
} from "@/server/infrastructure/db/schema";
import { createAuth } from "@/lib/auth";
import { createMicrosoftAuth } from "@/modules/auth/microsoft/provider";
import { microsoftCallback } from "@/modules/auth/microsoft/flow";
import {
  readMicrosoftConfig,
  saveMicrosoftConfig,
  resolveMicrosoftOrganization,
} from "@/modules/auth/microsoft/settings";
import {
  microsoftSettingsKey,
  type StoredMicrosoftConfig,
} from "@/modules/auth/microsoft/config";

const suite = process.env.IAM_INTEGRATION_DATABASE_URL
  ? describe.sequential
  : describe.skip;
suite("Microsoft organization SSO with real Better Auth and PostgreSQL", () => {
  const org = crypto.randomUUID(),
    otherOrg = crypto.randomUUID(),
    userId = crypto.randomUUID();
  const tenantId = crypto.randomUUID(),
    clientId = crypto.randomUUID(),
    oid = crypto.randomUUID();
  const email = `${userId}@example.test`;
  const origin = "http://localhost:3000";
  const { jwk, jwt } = microsoftTokenFixture();
  let config: StoredMicrosoftConfig;
  let claims: Record<string, unknown>;
  let exchange: URLSearchParams | undefined;
  const states: string[] = [];
  const input = {
    enabled: true,
    clientId,
    tenantId,
    loginOrigin: origin,
    emailDomains: ["example.test"],
    clientSecret: "test-microsoft-secret",
  };
  async function start() {
    const auth = await createMicrosoftAuth(org, config);
    const response = await auth.handler(
      new Request(`${origin}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify({
          provider: "microsoft",
          callbackURL: `${origin}/fr/chat`,
          additionalData: {
            organizationId: org,
            microsoftRevision: config.revision,
          },
        }),
      }),
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    const url = new URL(data.url);
    const state = url.searchParams.get("state")!;
    states.push(state);
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    return { url, state, cookie };
  }
  async function callback(
    flow: Awaited<ReturnType<typeof start>>,
    cookie = flow.cookie,
  ) {
    return microsoftCallback(
      new Request(
        `${origin}/api/auth/callback/microsoft?code=test-code&state=${flow.state}`,
        { headers: { cookie } },
      ),
    );
  }
  beforeAll(async () => {
    await db.insert(users).values({
      id: userId,
      email,
      name: "Existing user",
      emailVerified: false,
    });
    await db.insert(accounts).values({
      userId,
      accountId: userId,
      providerId: "credential",
      password: "unchanged-password-hash",
    });
    await db.insert(organizations).values([
      { id: org, name: "SSO test", slug: org },
      { id: otherOrg, name: "Other SSO", slug: otherOrg },
    ]);
    await db
      .insert(organizationMembers)
      .values({ organizationId: org, userId });
    await saveMicrosoftConfig(org, userId, input, true);
    config = (await readMicrosoftConfig(org))!;
  });
  beforeEach(() => {
    const now = Math.floor(Date.now() / 1000);
    claims = {
      aud: clientId,
      iss: `https://login.microsoftonline.com/${tenantId}/v2.0`,
      tid: tenantId,
      oid,
      sub: "pairwise-subject",
      email: email.toUpperCase(),
      name: "Microsoft name",
      iat: now,
      exp: now + 3600,
    };
    exchange = undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (request: string | URL | Request, init?: RequestInit) => {
        const url = String(request instanceof Request ? request.url : request);
        if (url.endsWith("/discovery/v2.0/keys"))
          return Response.json({ keys: [jwk] });
        if (url.endsWith("/oauth2/v2.0/token")) {
          exchange = new URLSearchParams(String(init?.body));
          return Response.json({
            token_type: "Bearer",
            access_token: "private-access-token",
            id_token: jwt(claims),
            expires_in: 3600,
            scope: "openid profile email User.Read",
          });
        }
        throw new Error(`Unexpected network request: ${url}`);
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => {
    await db
      .delete(verifications)
      .where(inArray(verifications.identifier, states));
    await db
      .delete(appSettings)
      .where(
        inArray(appSettings.key, [
          microsoftSettingsKey(org),
          microsoftSettingsKey(otherOrg),
        ]),
      );
    await db
      .delete(auditEvents)
      .where(inArray(auditEvents.organizationId, [org, otherOrg]));
    await db
      .delete(organizations)
      .where(inArray(organizations.id, [org, otherOrg]));
    await db.delete(users).where(eq(users.id, userId));
  });
  it("routes by email domain, stores encrypted secrets, hides them from settings", async () => {
    const view = await saveMicrosoftConfig(org, userId, input, true);
    config = (await readMicrosoftConfig(org))!;
    expect(JSON.stringify(view)).not.toContain(input.clientSecret);
    expect(config.encryptedClientSecret).not.toContain(input.clientSecret);
    expect(
      (await resolveMicrosoftOrganization(email.toUpperCase()))?.organizationId,
    ).toBe(org);
    expect(await resolveMicrosoftOrganization("unknown@other.test")).toBeNull();
  });
  it("uses the tenant/app callback and PKCE without mailbox permissions", async () => {
    const flow = await start();
    expect(flow.url.pathname).toBe(`/${tenantId}/oauth2/v2.0/authorize`);
    expect(flow.url.searchParams.get("client_id")).toBe(clientId);
    expect(flow.url.searchParams.get("redirect_uri")).toBe(
      `${origin}/api/auth/callback/microsoft`,
    );
    expect(flow.url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(flow.url.searchParams.get("scope")).not.toMatch(
      /Mail\.|offline_access/,
    );
  });
  it("links the existing unverified email account and retains its ID/password/session access", async () => {
    const response = await callback(await start());
    expect(response.headers.get("location")).toBe(`${origin}/fr/chat`);
    expect(exchange?.get("code_verifier")).toBeTruthy();
    const cookie = response.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join("; ");
    const session = await createAuth().api.getSession({
      headers: new Headers({ cookie }),
    });
    expect(session?.user.id).toBe(userId);
    const rows = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, userId));
    expect(rows.find((row) => row.providerId === "credential")?.password).toBe(
      "unchanged-password-hash",
    );
    expect(rows.find((row) => row.providerId === "microsoft")?.accountId).toBe(
      `${tenantId}:${oid}`,
    );
    expect(
      rows.find((row) => row.providerId === "microsoft")?.accessToken,
    ).not.toBe("private-access-token");
    expect(
      await db.select().from(users).where(eq(users.email, email)),
    ).toHaveLength(1);
  });
  it("rejects a callback with no browser state cookie and replayed state", async () => {
    const flow = await start();
    expect((await callback(flow, "")).headers.get("location")).toContain(
      "error=",
    );
    expect(exchange).toBeUndefined();
    await callback(flow);
    expect((await callback(flow)).status).toBe(400);
  });
  it.each([
    "tenant",
    "audience",
    "issuer",
    "expired",
    "domain",
    "unknown-user",
  ])("rejects %s mismatch", async (mode) => {
    if (mode === "tenant") claims.tid = crypto.randomUUID();
    if (mode === "audience") claims.aud = crypto.randomUUID();
    if (mode === "issuer") claims.iss = "https://attacker.invalid";
    if (mode === "expired") claims.exp = 1;
    if (mode === "domain") claims.email = "user@attacker.test";
    if (mode === "unknown-user") claims.email = "unknown@example.test";
    expect((await callback(await start())).headers.get("location")).toContain(
      "error=",
    );
  });
  it("rejects suspended members even when their Microsoft account is already linked", async () => {
    await db
      .update(organizationMembers)
      .set({ status: "suspended" })
      .where(eq(organizationMembers.organizationId, org));
    expect((await callback(await start())).headers.get("location")).toContain(
      "error=",
    );
    await db
      .update(organizationMembers)
      .set({ status: "active" })
      .where(eq(organizationMembers.organizationId, org));
  });
  it("requires platform approval for changed trust and rejects duplicate domains", async () => {
    await expect(
      saveMicrosoftConfig(otherOrg, userId, input, true),
    ).rejects.toThrow("already assigned");
    await expect(
      saveMicrosoftConfig(
        org,
        userId,
        { ...input, loginOrigin: "https://attacker.invalid" },
        true,
      ),
    ).rejects.toThrow("Login origin");
    const flow = await start();
    const changed = await saveMicrosoftConfig(
      org,
      userId,
      { ...input, tenantId: crypto.randomUUID() },
      false,
    );
    expect(changed?.approved).toBe(false);
    expect(await resolveMicrosoftOrganization(email)).toBeNull();
    expect((await callback(flow)).status).toBe(400);
    await saveMicrosoftConfig(org, userId, input, true);
    config = (await readMicrosoftConfig(org))!;
  });
});
