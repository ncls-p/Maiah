# Skill installation trust boundary

Skills imported from GitHub are untrusted supply-chain input. AI Hub imports
bounded Markdown files only, but a repository can still change between a user's
review and their confirmation.

## Preview attestation

The preview endpoint requires `tools.configure` in the target workspace. It
runs the restricted `skills add` command in a temporary directory, extracts the
same Markdown snapshot used by installation, and returns a short-lived signed
attestation.

The attestation is bound to:

- the authenticated user and workspace;
- a canonical hash of the explicit package and skill names;
- a deterministic checksum of every imported Markdown path and content;
- a ten-minute expiry.

It is signed with HMAC-SHA-256 using the application encryption key. The client
cannot mint, extend, move, or alter an attestation.

## Installation

Installation requires the preview token. The server verifies the signature and
scope before contacting the source again, then rebuilds the Markdown snapshot
and compares its checksum. A mismatch or expired token returns HTTP `409` with
`SKILL_PREVIEW_STALE`; no database write occurs and the user must review the
new snapshot.

All skills in a matching snapshot are inserted in one database transaction, so
a multi-skill import cannot leave a partial installation.

The UI invalidates the preview as soon as the command changes and exposes the
install action only from the reviewed snapshot.
