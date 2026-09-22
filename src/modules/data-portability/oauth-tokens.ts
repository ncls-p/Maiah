import {
  symmetricDecrypt,
  symmetricEncrypt,
  type SecretConfig,
} from "better-auth/crypto";
import type { Dataset } from "./registry";
import type { SecretCodec } from "./secrets";

const marker = "__maiah_portable_oauth_v1";
export function authTokenCodec(
  secret: string,
  versions?: { version: number; value: string }[],
): SecretCodec {
  const key: string | SecretConfig = versions?.length
    ? {
        keys: new Map(versions.map((entry) => [entry.version, entry.value])),
        currentVersion: versions[0].version,
        legacySecret: secret,
      }
    : secret;
  return {
    encrypt: (data) => symmetricEncrypt({ key, data }),
    decrypt: (data) => symmetricDecrypt({ key, data }),
  };
}
/** Microsoft SSO enables Better Auth token encryption, independently from APP_ENCRYPTION_KEY. */
export async function transformAccountTokens(
  data: Dataset,
  mode: "export" | "import",
  codec: SecretCodec,
) {
  for (const account of data.account)
    for (const field of ["access_token", "refresh_token"]) {
      const value = account[field];
      if (mode === "export") {
        if (
          account.provider_id === "microsoft" &&
          typeof value === "string" &&
          (value.startsWith("$ba$") ||
            (value.length % 2 === 0 && /^[a-f0-9]+$/i.test(value)))
        ) {
          account[field] = { [marker]: await codec.decrypt(value) };
        } else if (value && typeof value === "object")
          throw new Error("Invalid account token format");
      } else if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        if (
          account.provider_id !== "microsoft" ||
          Object.keys(record).length !== 1 ||
          typeof record[marker] !== "string"
        )
          throw new Error("Invalid portable account token");
        account[field] = await codec.encrypt(record[marker]);
      }
    }
}
