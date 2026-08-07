# API compatibility and usage analytics

## Compatible model APIs

Maiah exposes enabled workspace models through two stateless compatibility
surfaces. Both use scoped workspace API keys and enforce the `models.view` or
`models.invoke` permission before resolving a model.

| Protocol  | Base URL         | Authentication            | Main routes                                  |
| --------- | ---------------- | ------------------------- | -------------------------------------------- |
| OpenAI    | `/api/v1`        | `Authorization: Bearer …` | `/models`, `/chat/completions`, `/responses` |
| Anthropic | `/api/anthropic` | `x-api-key: …` or Bearer  | `/v1/models`, `/v1/messages`                 |

The Anthropic surface accepts the Messages API representation for system
prompts, text and image blocks, tool definitions, `tool_use` / `tool_result`
round trips, sampling settings, stop sequences, and streaming. Streaming uses
the Anthropic SSE sequence (`message_start`, content block events,
`message_delta`, and `message_stop`) so the official Anthropic SDK can consume
it without a custom transport.

Both surfaces resolve the public model name against the current workspace and
then use the configured provider adapter. Compatibility therefore does not
require the upstream provider itself to be OpenAI or Anthropic.

## Usage event accounting

Every successful compatible API generation records:

- workspace, initiating user, provider, and model identifiers;
- operation (`openai.chat.completions`, `openai.responses`, or
  `anthropic.messages`);
- input and output tokens, latency, status, and timestamp;
- calculated cost and currency when the selected model has token pricing;
- USD cost in the legacy `cost_usd` column only when the configured currency is
  USD.

Costs are never converted implicitly. Analytics returns an array of totals by
currency, preventing EUR and USD values from being added together.

## Analytics queries

`GET /api/workspace/usage` applies the requested operation and date filters to
the complete matching dataset. The `limit` parameter affects only the recent
event list, not totals or breakdowns.

The response includes global totals, daily activity, per-user, per-team,
per-model and per-operation breakdowns, recent enriched events, and the monthly
workspace token quota.

Team rows attribute a user's event to each organization team they belong to.
This is intentional for evaluating individual team footprints; team rows
should not be summed to reconstruct the global total when people belong to
multiple teams.

## Organization branding

Organizations can store a data-URL logo and choose Ocean, Forest, Ember,
Violet, Slate, or a custom theme. Every theme defines separate light and dark
palettes for the complete semantic color system, so branding applies across
navigation, surfaces, controls, feedback states, charts, and content instead
of only tinting the header. The logo is limited to 256 KB and common browser
image formats. The active workspace applies the branding of its own
organization throughout the platform.

The organization can also customize the chat welcome hero independently in
English and French. Its eyebrow, first line, second-line prefix, emphasized
wording, and suffix are stored with the organization and rendered for every
workspace belonging to it. Missing localized values fall back to the standard
Maiah copy, so partial configurations remain safe.

Only principals with `organization.update` may change branding. All members
can read the logo, semantic light/dark palettes, and welcome copy so the same
identity is rendered consistently across projects.
