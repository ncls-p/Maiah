import { and, eq, sql } from "drizzle-orm";
import { microsoft } from "better-auth/social-providers";
import { createAuth } from "@/lib/auth";
import { decryptValue } from "@/lib/crypto";
import { db } from "@/server/infrastructure/db";
import {
  accounts,
  organizationMembers,
  users,
} from "@/server/infrastructure/db/schema";
import { microsoftIdentity, type StoredMicrosoftConfig } from "./config";

export async function createMicrosoftAuth(
  organizationId: string,
  config: StoredMicrosoftConfig,
) {
  const options = {
    clientId: config.clientId,
    clientSecret: await decryptValue(config.encryptedClientSecret),
    tenantId: config.tenantId,
    disableSignUp: true,
    disableIdTokenSignIn: true,
    disableProfilePhoto: true,
    // Mail permissions are requested by a future explicit mail connection, not sign-in.
    disableDefaultScope: true,
    scope: ["openid", "profile", "email", "User.Read"],
  };
  const verifier = microsoft({ ...options, disableIdTokenSignIn: false });
  return createAuth({
    baseURL: config.loginOrigin,
    onAPIError: {
      errorURL: `${config.loginOrigin}/fr/auth/signin?microsoftError=1`,
    },
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        trustedProviders: ["microsoft"],
        requireLocalEmailVerified: false,
      },
    },
    socialProviders: {
      microsoft: {
        ...options,
        async getUserInfo(tokens) {
          if (
            !tokens.idToken ||
            !(await verifier.verifyIdToken(tokens.idToken, undefined))
          )
            return null;
          // Verification above checks signature, audience, issuer and expiry before reading claims.
          const profile = JSON.parse(
            Buffer.from(tokens.idToken.split(".")[1], "base64url").toString(),
          ) as Record<string, unknown>;
          if (!profile.email && tokens.accessToken) {
            const response = await fetch(
              "https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName",
              {
                headers: { Authorization: `Bearer ${tokens.accessToken}` },
                signal: AbortSignal.timeout(10_000),
              },
            ).catch(() => null);
            if (!response?.ok) return null;
            const graph = await response.json();
            if (graph.id !== profile.oid) return null;
            profile.email = graph.mail || graph.userPrincipalName;
          }
          const identity = microsoftIdentity(profile, config);
          if (!identity) return null;
          // Resolve globally before checking membership: case variants must never select another account.
          const matches = await db
            .select()
            .from(users)
            .where(sql`lower(${users.email}) = ${identity.email}`)
            .limit(2);
          if (matches.length !== 1 || matches[0].banned) return null;
          const user = matches[0];
          const [membership] = await db
            .select({ id: organizationMembers.id })
            .from(organizationMembers)
            .where(
              and(
                eq(organizationMembers.userId, user.id),
                eq(organizationMembers.organizationId, organizationId),
                eq(organizationMembers.status, "active"),
              ),
            )
            .limit(1);
          if (!membership) return null;
          const linked = await db
            .select({ userId: accounts.userId })
            .from(accounts)
            .where(
              and(
                eq(accounts.providerId, "microsoft"),
                eq(accounts.accountId, identity.accountId),
              ),
            )
            .limit(1);
          if (linked[0] && linked[0].userId !== user.id) return null;
          // Better Auth queries email in lowercase; preserve the user ID for legacy mixed-case rows.
          if (user.email !== identity.email)
            await db
              .update(users)
              .set({ email: identity.email })
              .where(eq(users.id, user.id));
          return {
            user: {
              id: identity.accountId,
              email: identity.email,
              name: user.name,
              emailVerified: user.emailVerified,
              image: user.image ?? undefined,
            },
            data: profile,
          };
        },
      },
    },
  });
}
