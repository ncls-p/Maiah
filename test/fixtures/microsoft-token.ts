import { generateKeyPairSync, sign } from "node:crypto";

export function microsoftTokenFixture() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  return {
    jwk: {
      ...publicKey.export({ format: "jwk" }),
      kid: "test-key",
      alg: "RS256",
      use: "sig",
    },
    jwt(claims: Record<string, unknown>) {
      const head = Buffer.from(
        JSON.stringify({ alg: "RS256", kid: "test-key" }),
      ).toString("base64url");
      const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
      const payload = `${head}.${body}`;
      return `${payload}.${sign("RSA-SHA256", Buffer.from(payload), privateKey).toString("base64url")}`;
    },
  };
}
