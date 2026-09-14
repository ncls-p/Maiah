/** Shared by the connection editor and server; contains no credentials or server imports. */
const secretKeys = {
  basic: ["username", "password"],
  oauth: ["clientId", "clientSecret", "username", "password"],
  api_key: ["apiKey"],
} as const;

export class ServiceNowConnectionValidationError extends Error {}

export function serviceNowSecretKeys(authType: unknown): readonly string[] {
  const type = authType ?? "basic";
  if (typeof type !== "string" || !Object.hasOwn(secretKeys, type)) {
    throw new ServiceNowConnectionValidationError(
      "Invalid ServiceNow authentication type",
    );
  }
  return secretKeys[type as keyof typeof secretKeys];
}

export function serviceNowSecretsForAuth(
  authType: unknown,
  secrets: Record<string, string>,
) {
  return Object.fromEntries(
    serviceNowSecretKeys(authType)
      .filter((key) => Boolean(secrets[key]))
      .map((key) => [key, secrets[key]]),
  );
}

export function validateServiceNowConnection(input: {
  config?: Record<string, unknown> | null;
  secrets?: Record<string, string> | null;
  previousAuthType?: unknown;
  hasExistingSecrets?: boolean;
}) {
  const config = input.config ?? {};
  const keys = serviceNowSecretKeys(config.authType);
  let instance: URL;
  try {
    instance = new URL(String(config.instanceUrl ?? ""));
  } catch {
    throw new ServiceNowConnectionValidationError(
      "A valid ServiceNow instance URL is required",
    );
  }
  if (
    instance.protocol !== "https:" ||
    instance.username ||
    instance.password
  ) {
    throw new ServiceNowConnectionValidationError(
      "ServiceNow requires an HTTPS URL without embedded credentials",
    );
  }
  const sameAuth =
    (input.previousAuthType ?? "basic") === (config.authType ?? "basic");
  if (input.secrets === undefined && input.hasExistingSecrets && sameAuth)
    return;
  for (const key of keys) {
    if (!input.secrets?.[key]?.trim()) {
      throw new ServiceNowConnectionValidationError(
        `ServiceNow ${key} is required for ${config.authType ?? "basic"} authentication`,
      );
    }
  }
}
