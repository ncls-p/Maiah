import { createHmac, timingSafeEqual } from "node:crypto";

export function signConfirmation(
  secret: string,
  userId: string,
  archiveDigest: string,
  expires = Date.now() + 10 * 60_000,
) {
  const payload = `${expires}.${archiveDigest}.${userId}`;
  return `${expires}.${createHmac("sha256", secret).update(`maiah-import-v1:${payload}`).digest("hex")}`;
}
export function verifyConfirmation(
  secret: string,
  userId: string,
  archiveDigest: string,
  token: string,
) {
  const [expiry, signature] = token.split(".");
  const expires = Number(expiry);
  if (
    !Number.isSafeInteger(expires) ||
    expires < Date.now() ||
    expires > Date.now() + 10 * 60_000 ||
    !/^[a-f0-9]{64}$/.test(signature ?? "")
  )
    return false;
  const expected = signConfirmation(secret, userId, archiveDigest, expires);
  return (
    token.length === expected.length &&
    timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  );
}
