# OpenAI tool schema compatibility

The OpenAI Responses adapter applies `withOpenAISchemaCompatibility` before the
SDK prepares requests. Every function tool passes through this boundary,
regardless of its origin (built-in, custom, MCP), for both generation and streaming.
The boundary also covers tool output schemas and structured response schemas.

JSON Schema `propertyNames` validates object keys, which are always strings.
An enum, reference, boolean or composite schema need not declare that type.
The OpenAI SDK nevertheless rejects it unless `type: "string"` is explicit.
The adapter adds that implicit string restriction as a conjunction on a copy.
The SDK then performs its normal removal of the unsupported keyword and emits
its compatibility warning. This avoids the client-side exception before HTTP.

Original schemas, tool validators, execution callbacks, approval checks, strict
settings and tool selection remain unchanged. Provider-side enforcement of
property-name constraints is not available; existing local/MCP validators remain
responsible for those constraints. This is a fix for `propertyNames` compatibility,
not a claim that OpenAI supports every JSON Schema keyword.

Traversal follows schema-bearing keywords only. Property names and literal data
in `default`, `examples`, `const` and `enum` are not rewritten. Other providers
and the Chat Completions adapter retain their original behavior.

Regression tests use the real OpenAI SDK and a simulated HTTP transport for
multiple tools, nested constraints, generation and streaming. A separate AI SDK
test confirms that invalid tool arguments still fail validation before execution.

Tracking: [DEO-50](https://linear.app/deodis/issue/DEO-50/compatibilite-propertynames-pour-tous-les-outils-envoyes-a-openai),
related to DEO-11.

## Cross-SDK regression coverage

`provider-schema-matrix.test.ts` runs the real installed SDKs behind the adapter
registry with mocked HTTP responses. The same three tools and nested schemas are
exercised through generation and streaming on nine paths:

- OpenAI Responses and the native fallback;
- OpenAI-compatible Chat Completions;
- Anthropic Messages;
- Vercel Gateway's Chat Completions adapter;
- Dragonfly's OpenAI and Anthropic model paths;
- Amazon Bedrock Converse with API-key and IAM authentication.

All 18 cases check outbound schemas, successful tool-call decoding and unchanged
original inputs. SSE and AWS binary event streams are consumed to completion;
stream error events fail the tests. The Responses compatibility warning is also
asserted. Other SDKs preserve the complete original schema, including property-name
constraints, because they do not have OpenAI's local normalization restriction.

These tests verify installed SDK behavior and protocol handling, not acceptance
by every remote model or gateway. No production credentials or paid model calls
are used; upstream schema support still depends on the selected model/service.
