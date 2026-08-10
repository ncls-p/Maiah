import type { MarketplaceManifest } from "./manifest-types";

const BLOCKED_MANIFEST_KEYS = new Set([
  "encryptedcredentialrefs",
  "encryptedheadersjson",
  "encryptedenvjson",
  "encryptedpayload",
  "secretsincluded",
  "credentialrefs",
  "credentialvalues",
  "headers",
  "headersjson",
  "env",
  "envjson",
]);

const SECRET_KEY_PATTERN =
  /(?:^|[_-])(api[_-]?key|access[_-]?key|private[_-]?key|secret|token|password|authorization|cookie)(?:$|[_-])/i;

function normalizedKey(key: string) {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isSecretKey(key: string) {
  const normalized = normalizedKey(key);
  return (
    BLOCKED_MANIFEST_KEYS.has(normalized) ||
    SECRET_KEY_PATTERN.test(key) ||
    /(apikey|accesskey|privatekey|clientsecret|secret|accesstoken|refreshtoken|authtoken|token|password|authorization|cookie)$/i.test(
      normalized,
    )
  );
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!value || typeof value !== "object") return value;

  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (isSecretKey(key)) continue;
    sanitized[key] = sanitizeValue(child);
  }
  return sanitized;
}

/**
 * Marketplace packages are portable configuration only. Credential values,
 * including encrypted values, must never cross a workspace boundary.
 */
export function sanitizeMarketplaceManifest(
  manifest: unknown,
): MarketplaceManifest {
  return sanitizeValue(manifest) as MarketplaceManifest;
}

export function containsMarketplaceSecretMaterial(value: unknown): boolean {
  if (Array.isArray(value))
    return value.some(containsMarketplaceSecretMaterial);
  if (!value || typeof value !== "object") return false;

  return Object.entries(value).some(
    ([key, child]) =>
      isSecretKey(key) || containsMarketplaceSecretMaterial(child),
  );
}
