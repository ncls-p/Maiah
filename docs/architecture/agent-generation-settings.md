# Assistant generation settings

Advanced controls display API names (`temperature`, `top_p`, `top_k`,
`presence_penalty`, `frequency_penalty`, `seed`, `stop`,
`max_output_tokens`, `max_retries`, `tool_choice`) with localized help.
The existing editor/API fields retain their names for backwards compatibility.
A blank optional setting leaves the provider default. Zero is preserved.

`generationSettings.providerOptions` is an optional JSON object in **AI SDK
format**, grouped by provider namespace. For example:

```json
{
  "openai": { "textVerbosity": "low", "parallelToolCalls": false }
}
```

These options are forwarded to the installed provider adapter; keys and support
vary by provider and model. This is not an arbitrary HTTP request-body override.
The chat's explicit reasoning selection overrides matching saved provider options,
while preserving other options. Provider options are limited to 16 KB. Credentials
belong in the provider connection, never in assistant configuration.

The common settings flow through chat, companion chat, durable agent execution
(including scheduled and delegated runs), and the workflow builder. Model output,
tree limits and cancellation retain their existing precedence. Creation via API/MCP
accepts the same generation settings as subsequent edits.

## Persistent compatibility corrections

Each provider call is wrapped **inside** the existing usage-limits wrapper. On an
explicit HTTP 400/422 rejection naming an unsupported sampling parameter, only
that parameter is omitted and the provider call is retried. Seven sampling
parameters are eligible; each can be removed once. No outer agent loop is replayed.
An opened stream is never retried, even if it later emits an error. Network,
permission, quota and unrelated validation failures keep their normal error path.
SDK unsupported-setting warnings also record exclusions without another request.

Corrections are persisted in `app_settings`, keyed by immutable assistant version,
actual provider/model identity and individual setting. Independent rows provide
an atomic union during simultaneous chats; configuration versions are never
rewritten. Future calls load the corrections, including after a server restart.
Saving a new version or selecting another model starts a fresh compatibility scope.
The editor displays excluded settings returned by the authorized version endpoint.
Only setting names/version IDs are stored or logged, never prompts or upstream
error bodies. No database migration is needed.

This mechanism does not invent replacement values for invalid user input and does
not remove limits, tools, structured output or authorization settings. Unsupported
custom provider options remain explicit errors: deleting arbitrary nested options
could change behavior beyond the user's intent.

## Verification

Unit tests cover zero values, option merging, successive rejections, persisted
exclusions, SDK warnings, cancellation/error boundaries and no stream replay.
A real local HTTP provider in Playwright rejects `temperature` then `top_p`;
the first chat succeeds, PostgreSQL records the exclusions, and the second chat
omits them. The MCP/editor scenario verifies numeric mapping, complete one-call
creation, conflict handling and persistence of advanced fields after reload.
