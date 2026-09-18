import { createRemoteJWKSet, jwtVerify } from "jose";

/** Entra's RSA signing keys may omit the optional JWK `alg` property. */
export async function verifyMicrosoftToken(
  token: string,
  config: { tenantId: string; clientId: string },
) {
  const authority = `https://login.microsoftonline.com/${config.tenantId}`;
  try {
    const keys = createRemoteJWKSet(
      new URL(`${authority}/discovery/v2.0/keys`),
      { timeoutDuration: 10_000 },
    );
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ["RS256"],
      audience: config.clientId,
      issuer: `${authority}/v2.0`,
      maxTokenAge: "1h",
      requiredClaims: ["exp", "iat", "sub"],
    });
    return payload;
  } catch {
    // Fail closed without logging identity tokens or provider response bodies.
    return null;
  }
}
