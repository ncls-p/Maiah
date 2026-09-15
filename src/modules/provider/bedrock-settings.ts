import { z } from "zod";
import { decryptValue, encryptValue } from "@/lib/crypto";
export const bedrockInputSchema = z.object({
  region: z
    .string()
    .trim()
    .regex(/^[a-z]{2}(?:-[a-z]+)+-\d$/)
    .max(40),
  authMode: z.enum(["api-key", "iam"]),
  accessKeyId: z.string().trim().max(256).optional(),
  secretAccessKey: z.string().max(4096).optional(),
  sessionToken: z.string().max(16384).optional(),
});
export type BedrockInput = z.infer<typeof bedrockInputSchema>;
export type BedrockSettings = Pick<BedrockInput, "region" | "authMode">;
export async function prepareBedrockSettings(
  input: unknown,
  apiKey: string | undefined,
  existing?: {
    encryptedApiKey?: string | null;
    encryptedAwsCredentials?: string | null;
  },
) {
  const value = bedrockInputSchema.parse(input);
  let encryptedAwsCredentials: string | null = null;
  if (value.authMode === "api-key") {
    if (!apiKey?.trim() && !existing?.encryptedApiKey)
      throw new Error("BEDROCK_API_KEY_REQUIRED");
  } else {
    const old = existing?.encryptedAwsCredentials
      ? JSON.parse(await decryptValue(existing.encryptedAwsCredentials))
      : {};
    const credentials = {
      accessKeyId: value.accessKeyId || old.accessKeyId,
      secretAccessKey: value.secretAccessKey || old.secretAccessKey,
      sessionToken:
        value.sessionToken === undefined
          ? old.sessionToken
          : value.sessionToken || undefined,
    };
    if (!credentials.accessKeyId || !credentials.secretAccessKey)
      throw new Error("BEDROCK_IAM_CREDENTIALS_REQUIRED");
    encryptedAwsCredentials = await encryptValue(JSON.stringify(credentials));
  }
  return {
    bedrockConfigJson: { region: value.region, authMode: value.authMode },
    encryptedAwsCredentials,
  };
}
