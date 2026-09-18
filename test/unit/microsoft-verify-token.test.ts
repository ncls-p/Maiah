import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyMicrosoftToken } from "@/modules/auth/microsoft/verify-token";
import { microsoftTokenFixture } from "../fixtures/microsoft-token";

const config = { tenantId: crypto.randomUUID(), clientId: crypto.randomUUID() };
const fixture = microsoftTokenFixture();
const now = Math.floor(Date.now() / 1000);
const claims = {
  sub: "microsoft-subject",
  aud: config.clientId,
  iss: `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
  iat: now,
  exp: now + 3600,
};

afterEach(() => vi.unstubAllGlobals());

function serveKeys(key = fixture.jwk) {
  const fetch = vi.fn(async () => Response.json({ keys: [key] }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("Microsoft ID token signature verification", () => {
  it("accepts Entra RSA keys without alg and fetches only the configured tenant", async () => {
    expect(fixture.jwk).not.toHaveProperty("alg");
    const fetch = serveKeys();
    expect(await verifyMicrosoftToken(fixture.jwt(claims), config)).toEqual(
      claims,
    );
    expect(fetch).toHaveBeenCalledWith(
      `https://login.microsoftonline.com/${config.tenantId}/discovery/v2.0/keys`,
      expect.any(Object),
    );
  });

  it.each([
    { aud: "another-application" },
    { iss: "https://login.microsoftonline.com/another-tenant/v2.0" },
    { exp: now - 60 },
    { exp: undefined },
    { iat: now - 7200 },
    { iat: now + 3600 },
  ])("rejects invalid claims: %j", async (invalid) => {
    serveKeys();
    expect(
      await verifyMicrosoftToken(
        fixture.jwt({ ...claims, ...invalid }),
        config,
      ),
    ).toBeNull();
  });

  it("rejects a token signed with an unrelated private key", async () => {
    serveKeys();
    expect(
      await verifyMicrosoftToken(microsoftTokenFixture().jwt(claims), config),
    ).toBeNull();
  });

  it("rejects an unknown signing key", async () => {
    serveKeys({ ...fixture.jwk, kid: "other-key" });
    expect(await verifyMicrosoftToken(fixture.jwt(claims), config)).toBeNull();
  });

  it("fails closed when discovery is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("unavailable")));
    expect(await verifyMicrosoftToken(fixture.jwt(claims), config)).toBeNull();
  });

  it("rejects unsupported algorithms before fetching signing keys", async () => {
    const fetch = serveKeys();
    const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString(
      "base64url",
    );
    const token = `${header}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.AAAA`;
    expect(await verifyMicrosoftToken(token, config)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
