import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

export const IMPORT_ACKNOWLEDGEMENT = "IMPORT";
export interface ConfirmationBinding {
  userId: string;
  sessionId: string;
  /** Settings panel the preview was made from; absent for the platform panel. */
  organizationId?: string;
  archiveDigest: string;
}
// Never use the application encryption key directly as an HMAC key.
function confirmationKey(secret: string) {
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(secret, "utf8"),
      Buffer.alloc(0),
      "maiah-data-portability-import-confirmation-v2",
      32,
    ),
  );
}
export function signConfirmation(
  secret: string,
  binding: ConfirmationBinding,
  expires = Date.now() + 10 * 60_000,
) {
  const payload = JSON.stringify([
    expires,
    binding.userId,
    binding.sessionId,
    binding.organizationId ?? "instance",
    binding.archiveDigest,
  ]);
  return `${expires}.${createHmac("sha256", confirmationKey(secret)).update(payload).digest("hex")}`;
}
export function verifyConfirmation(
  secret: string,
  binding: ConfirmationBinding,
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
  const expected = signConfirmation(secret, binding, expires);
  return (
    token.length === expected.length &&
    timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  );
}
