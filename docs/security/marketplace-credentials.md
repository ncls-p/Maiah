# Marketplace credential boundary

Marketplace packages are portable configuration. They may describe which
credentials an installed resource needs, but they must never contain credential
values from the publisher's workspace, even when those values are encrypted.

## Invariants

- MCP and custom-tool manifests contain `credentialSchema` and
  `requiresCredentials` only.
- Agent bundles apply the same rule to every embedded MCP preset and custom
  tool.
- Draft creation sanitizes manifests before persistence.
- Marketplace reads and installs sanitize historical manifests again as a
  defense-in-depth boundary.
- Installation creates the resource in an unconfigured state and asks the
  installer to provide credentials in their own workspace.
- The publish API and UI expose no `includeSecrets` option.

Migration `0026_marketplace_manifest_secret_redaction.sql` recursively removes
known encrypted payload containers and secret-like keys from every historical
`marketplace_item_versions.manifest_json` document. The migration is
idempotent with respect to the resulting data: applying the sanitizer again
does not change an already-safe manifest.

## Incident response for earlier publications

Encryption does not make a credential portable or safe to disclose. If a
marketplace item was created before this boundary was deployed:

1. apply migration `0026` before serving marketplace traffic;
2. identify credentials referenced by the publisher resources that produced
   the affected item;
3. revoke or rotate those credentials at their provider;
4. update the publisher resource with the rotated values;
5. verify the marketplace version contains schemas only, then republish a new
   version;
6. review access logs and audit events for reads or installs of the affected
   item.

Do not attempt to copy an encrypted payload to an installing user. Encryption
keys, ownership and authorization are workspace-local concerns.
