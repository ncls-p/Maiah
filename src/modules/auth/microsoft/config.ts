import { z } from "zod";

export const microsoftConfigSchema = z.object({
  enabled: z.boolean(),
  clientId: z.uuid(),
  tenantId: z.uuid(),
  loginOrigin: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.origin === value &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)))
    );
  }, "Use an HTTPS origin without a path or trailing slash"),
  emailDomains: z
    .array(
      z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/),
    )
    .min(1)
    .max(20),
});
export const microsoftUpdateSchema = microsoftConfigSchema.extend({
  clientSecret: z.string().min(1).max(4096).optional(),
});
export type MicrosoftConfig = z.infer<typeof microsoftConfigSchema>;
export type StoredMicrosoftConfig = MicrosoftConfig & {
  encryptedClientSecret: string;
  revision: string;
  approved: boolean;
};
export const microsoftSettingsKey = (organizationId: string) =>
  `microsoft-sso:${organizationId}`;

export function microsoftIdentity(
  profile: Record<string, unknown>,
  config: MicrosoftConfig,
) {
  const email =
    typeof profile.email === "string" ? profile.email.trim().toLowerCase() : "";
  if (
    profile.tid !== config.tenantId ||
    typeof profile.oid !== "string" ||
    !z.uuid().safeParse(profile.oid).success ||
    !z.email().safeParse(email).success ||
    !config.emailDomains.includes(email.split("@")[1])
  )
    return null;
  return { email, accountId: `${config.tenantId}:${profile.oid}` };
}
