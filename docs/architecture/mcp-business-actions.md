# MCP business actions and companion policy

`maiah_search_actions` accepts French/English resource and intent terms and returns
up to five input schemas (maximum ten), rather than sending every schema on every
model turn. `maiah_run_action` accepts `operationId` and one flat `input` object.
It routes path/query/body fields, fills declared project/organization context and
normalizes the existing assistant numeric-string fields. Explicit scope overrides
still go through the original HTTP route and its permissions. No parallel service
layer or privileged service identity is introduced.

Known IDs and versions come from read/list results. Creation accepts the model,
prompt, generation settings and capabilities together in the existing atomic
transaction. Updates still require `baseVersionId`: a 409 is returned, never
silently overwritten. Mutations are never automatically retried after ambiguous
results. Existing advanced `describe` and `execute` tools remain compatible.

The companion uses the same MCP server through the MCP SDK's in-memory transport.
Each call rechecks the active companion entitlement, then the HTTP route rechecks
the user's resource authorization. API clients retain their token scopes. The
companion prompt gives MCP priority for requested actions, while UI tools display
results or guide a user who wants to act themselves. UI navigation accepts only
real localized workspace route patterns; unknown routes return an error before
leaving the page. This does not guarantee that a dynamic resource still exists.

## Coverage and maintenance

`npm run mcp:generate` derives JSON input types from route Zod validators using the
TypeScript checker without executing route modules. Service-level validators have
explicit mappings. It also generates actual workspace pages and the
[MCP coverage inventory](mcp-action-coverage.md). `npm run mcp:check` runs in CI.
Schemas are discovery hints: runtime Zod refinements, permission requirements and
resource constraints remain enforced by the original routes. The existing
permission inventory documents exact route permission checks.

Multipart requests accept up to ten inline base64 files, with a combined 180 KB
limit within the MCP request budget; large uploads use the application upload UI.
Routes that also accept JSON (e.g. text documents) retain that option. File exports
return authenticated links rather than loading binary content into model context.
Interactive model streams and protocol/callback routes are explicitly excluded;
durable run creation, status and cancellation remain discoverable.

## Cost of the common path

When provider/model IDs are already known, creating a configured private assistant
requires two MCP calls: search (including schema), then run. Previously the tool
contract required search, describe, execute and often follow-up configuration calls.
Opening the returned canonical page is optional presentation. This deterministic
protocol reduction is tested; a model's own reasoning time and number of discovery
calls are not guaranteed by the API and must be measured separately in production.
