# Microsoft sign-in per organization

A single **Sign in with Microsoft** button first asks for a work email. Maiah
resolves its exact domain to one enabled, approved organization configuration,
then starts Better Auth's authorization-code/PKCE flow using that organization's
single-tenant Entra application. The encrypted database secret is never returned
to the UI or stored in Git/Coolify environment variables.

## Organization setup

In Administration → Settings → choose the organization → Microsoft Entra ID:

1. Enter client ID, tenant ID, the **secret value** (not the secret ID), email
   domains and the trusted HTTPS sign-in origin.
2. Register the displayed callback as an Entra **Web** redirect URI. For Deodis:
   `https://maiah.deodis.com/api/auth/callback/microsoft`.
3. Save and enable. Organization administrators can supply their own application;
   a platform administrator must validate ownership of the domain/tenant pairing
   and save once to approve it. Changing the pairing revokes approval. Secret
   rotation within the same registration preserves approval. Duplicate active
   domain claims are rejected under a database lock.
4. Add users to the organization before their first Microsoft sign-in. Only
   existing, active, non-banned members can sign in. Email matching reuses their
   existing user ID, conversations, permissions and password login. No automatic
   membership or public registration is enabled.

The email field only selects a provider, never proves identity. The callback
checks the signed token's issuer, audience, expiration, tenant and object ID, then
checks the email domain and current membership. A missing email claim is resolved
through Graph `/me`, bound to the same object ID. Ambiguous local email variants
are rejected. Provider identities use `tenantId:oid`. State, browser-cookie
binding and PKCE remain validated by Better Auth; configuration changes invalidate
in-flight attempts. Tokens are encrypted at rest.

Requested sign-in scopes: `openid profile email User.Read`. Mail.ReadWrite,
Mail.Send and offline_access are intentionally deferred to a future explicit
mailbox connection. Configuring delegated permissions in Entra alone does not
cause Maiah to request or exercise them.

## Domains and deployment

Production declares **both** domains:

- Coolify: `https://maiah.deodis.com:3000,http://maiah.shiftify.eco:3000`.
  The Deodis reverse proxy forwards TLS to port 443, requiring a TLS ingress
  router. Both app upstreams use container port 3000. The legacy Cloudflare
  ingress keeps its existing HTTP routing.
- `BETTER_AUTH_URL=https://maiah.deodis.com`
- `BETTER_AUTH_TRUSTED_ORIGINS=https://maiah.deodis.com,https://maiah.shiftify.eco`

Do not change BETTER_AUTH_SECRET, APP_ENCRYPTION_KEY, database, volume names or
existing user IDs. Password login and existing cookies continue on the legacy
hostname. Cookies cannot be shared across these unrelated domains: clicking
Microsoft from the old hostname moves to the canonical sign-in origin before
setting OAuth cookies and finishes there. Existing old-domain sessions remain.

The GitHub deployment workflow persists both domain declarations on every
production deploy; PR previews keep only their own origin. Before production
rollout, stop the temporary `maiah-domain-probe` to release its conflicting TLS
router. Keep its configuration available for rollback. After rollout verify
`/api/auth/ok`, the sign-in page and password/session behavior on both hosts, then
configure Deodis through the organization UI and complete Microsoft sign-in.

Rollback: redeploy the previous immutable image tags without deleting volumes,
retain both trusted origins, and disable Microsoft in organization settings.
No destructive schema migration is introduced by this feature.

References: [Microsoft authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow),
[Better Auth Microsoft provider](https://www.better-auth.com/docs/authentication/microsoft),
[Microsoft sign-in branding](https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-branding-in-apps).
