import { eq, sql } from "drizzle-orm";
import { encryptValue } from "@/lib/crypto";
import { env } from "@/lib/env";
import { db } from "@/server/infrastructure/db";
import { appSettings, organizations } from "@/server/infrastructure/db/schema";
import { audit } from "@/server/domain/services/audit";
import {
  microsoftConfigSchema,
  microsoftSettingsKey,
  type StoredMicrosoftConfig,
  type microsoftUpdateSchema,
} from "./config";
import type { z } from "zod";

export async function readMicrosoftConfig(organizationId: string) {
  const [row] = await db
    .select({ value: appSettings.valueJson })
    .from(appSettings)
    .innerJoin(organizations, eq(organizations.id, organizationId))
    .where(eq(appSettings.key, microsoftSettingsKey(organizationId)))
    .limit(1);
  return row ? (row.value as StoredMicrosoftConfig) : null;
}

export function microsoftConfigView(config: StoredMicrosoftConfig | null) {
  return config
    ? {
        ...microsoftConfigSchema.parse(config),
        hasClientSecret: Boolean(config.encryptedClientSecret),
        approved: config.approved,
      }
    : null;
}

export async function saveMicrosoftConfig(
  organizationId: string,
  userId: string,
  input: z.infer<typeof microsoftUpdateSchema>,
  canApprove: boolean,
) {
  const origins = [
    env.BETTER_AUTH_URL,
    ...env.BETTER_AUTH_TRUSTED_ORIGINS.split(","),
  ].map((value) => value.trim());
  if (!origins.includes(input.loginOrigin))
    throw new Error(
      "Login origin must be explicitly configured in BETTER_AUTH_TRUSTED_ORIGINS",
    );
  const config = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('microsoft-sso-domain-claims'))`,
    );
    const [stored] = await tx
      .select({ value: appSettings.valueJson })
      .from(appSettings)
      .where(eq(appSettings.key, microsoftSettingsKey(organizationId)))
      .limit(1);
    const current = stored ? (stored.value as StoredMicrosoftConfig) : null;
    // A secret from another registration must never be silently reused.
    const sameRegistration =
      current?.clientId === input.clientId &&
      current?.tenantId === input.tenantId;
    const encryptedClientSecret = input.clientSecret
      ? await encryptValue(input.clientSecret)
      : sameRegistration
        ? current.encryptedClientSecret
        : "";
    if (!encryptedClientSecret)
      throw new Error("A client secret is required for this registration");
    const unchangedTrust =
      sameRegistration &&
      current?.loginOrigin === input.loginOrigin &&
      JSON.stringify([...current.emailDomains].sort()) ===
        JSON.stringify([...input.emailDomains].sort());
    const config: StoredMicrosoftConfig = {
      ...microsoftConfigSchema.parse(input),
      encryptedClientSecret,
      revision: crypto.randomUUID(),
      approved: canApprove || Boolean(current?.approved && unchangedTrust),
    };
    if (config.approved && config.enabled) {
      const claims = await tx
        .select({ key: appSettings.key, config: appSettings.valueJson })
        .from(appSettings)
        .where(sql`${appSettings.key} like 'microsoft-sso:%'`);
      if (
        claims.some(
          (row) =>
            row.key !== microsoftSettingsKey(organizationId) &&
            (row.config as StoredMicrosoftConfig).approved &&
            (row.config as StoredMicrosoftConfig).enabled &&
            (row.config as StoredMicrosoftConfig).emailDomains.some((domain) =>
              config.emailDomains.includes(domain),
            ),
        )
      )
        throw new Error(
          "An email domain is already assigned to another organization",
        );
    }
    await tx
      .insert(appSettings)
      .values({
        key: microsoftSettingsKey(organizationId),
        valueJson: config,
        updatedById: userId,
      })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { valueJson: config, updatedById: userId, updatedAt: new Date() },
      });
    return config;
  });
  await audit.emit({
    actorPrincipalType: "user",
    actorPrincipalId: userId,
    organizationId,
    action: "organization.microsoft-sso.updated",
    resourceType: "organization",
    resourceId: organizationId,
    outcome: "success",
    metadata: { enabled: config.enabled, tenantId: config.tenantId },
  });
  return microsoftConfigView(config);
}

export async function resolveMicrosoftOrganization(email: string) {
  const domain = email.trim().toLowerCase().split("@")[1];
  const rows = await db
    .select({ id: organizations.id, config: appSettings.valueJson })
    .from(organizations)
    .innerJoin(
      appSettings,
      sql`${appSettings.key} = 'microsoft-sso:' || ${organizations.id}::text`,
    );
  const matches = rows.filter((row) => {
    const config = row.config as StoredMicrosoftConfig;
    return (
      config.enabled && config.approved && config.emailDomains.includes(domain)
    );
  });
  if (matches.length !== 1) return null;
  return {
    organizationId: matches[0].id,
    config: matches[0].config as StoredMicrosoftConfig,
  };
}
