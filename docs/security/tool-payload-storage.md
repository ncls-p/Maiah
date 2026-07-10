# Tool payload storage and display

Tool inputs and outputs can contain credentials, private documents, generated
code, customer data, and provider-specific metadata. They must cross only the
boundaries that need their full fidelity.

## Storage model

- `tool_invocations.input_json_encrypted` and
  `tool_invocations.output_json_encrypted` retain the executor source of truth.
- New `message_parts` rows of type `tool-call` or `tool-result` store the full
  JSON in `content_encrypted`.
- Their `metadata_json` contains only `projectToolMessagePayload(...)`, a
  bounded secret-aware display projection.
- Conversation APIs project metadata again on read as defense in depth.
- Model-history reconstruction may decrypt the full message part internally so
  an assistant can continue working with an earlier artifact. The decrypted
  value is not returned to the browser or written to logs.
- Delegated progress is stricter: child-depth parts never enter the parent's
  model history, including artifact-shaped outputs. Only the bounded `result`
  text from a successful root `delegate_*` call is projected into that history;
  child identity, run IDs, task input, tools and errors remain UI-only.

## Live streams and telemetry

The stream bus projects complete tool calls, results, and approval events before
they enter replay memory or reach a subscriber. Partial tool-input JSON is not
streamed because a key and its value can arrive in different chunks and cannot
be safely redacted incrementally.

AI SDK input/output telemetry is disabled for chat runs. AI SDK DevTools is
explicit opt-in in local development and is never registered in production.

## Historical cleanup

Migration `0027_encrypt_tool_message_payloads.sql` removes plaintext historical
tool inputs and outputs from `message_parts.metadata_json`. Since SQL cannot
reproduce application AES-GCM encryption, it preserves only tool identifiers
and a redaction marker. New rows keep encrypted fidelity without reintroducing
plaintext metadata.
