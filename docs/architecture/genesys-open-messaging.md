# Genesys Open Messaging and human handoff

Tracking: [DEO-10](https://linear.app/deodis/issue/DEO-10/genesys-open-messaging-connexion-organisation-et-transfert-du-chat-ia).

## Product scope

V1 provides one Genesys connection and one Architect routing destination per
organization. Organization administrators manage it from Members → Organizations.
A project must be explicitly granted access. An assistant must have the built-in
`request_human_handoff` tool enabled on its active version. Temporary chats,
shared recipients, orchestrators and non-interactive runs cannot start a handoff.
Microsoft and Google integrations are outside this change.

The customer stays in Maiah. The consultant uses Genesys. Only text is bridged.
The first message contains the tool's reason and summary; a manual request shares
the recent user messages shown by the UI. Credentials are never provided to the
model. Received messages are identified as “Support Genesys”; webhook receipt
alone does not prove an agent is connected, since Architect can also send messages.
The verified participant state controls the takeover banner.

## Setup in Genesys

1. Check that the tenant has an Open Messaging capable licence.
2. Create a server OAuth client using Client Credentials. Assign minimum roles
   and the necessary divisions. The inbound message operation requires
   `conversation:message:receive`; reading the integration requires
   `messaging:integration:view`. Also authorize reading the target message
   conversations and disconnecting them. Verify those operations with the actual
   tenant's permissions before rollout; OAuth user tokens cannot substitute for
   the inbound operation's client token.
3. Create an Open Messaging integration. Configure the public HTTPS webhook
   on port 443 using the URL displayed in Maiah, and the same signature secret
   (at least 32 characters) in both products.
4. Associate the integration's recipient with an inbound message Architect flow
   that transfers to the intended support queue. Configure opening hours,
   unavailable-agent handling and supported text content in that flow.
5. Save the regional host, client ID/secret, integration ID, webhook secret and
   authorized projects in Maiah. Test the saved connection. This verifies OAuth,
   integration identity and the exact webhook URL/secret. It does not claim to
   verify routing or staffing. Every save requires another test before new sends.
6. Add “Human support · Genesys” to the assistant's tools. Set its instructions
   and approval policy for when to escalate, and include a useful concise summary.
7. Run a real message round trip, pickup, agent transfer, disconnect and return to
   AI using a test customer and consultant before enabling production access.

The application origin comes from `BETTER_AUTH_URL`, never from an untrusted Host
header. Run the existing worker alongside the web service. No global Genesys
credentials or new package dependencies are required.

## Protocol

The adapter uses the live Genesys Platform Swagger contract inspected on
2026-09-15:

- `POST /oauth/token` on the fixed regional login host;
- `GET /api/v2/conversations/messaging/integrations/open/{integrationId}`;
- `POST /api/v2/conversations/messages/{integrationId}/inbound/open/message?prefetchConversationId=true`;
- `GET /api/v2/conversations/messages/{conversationId}`;
- `PATCH /api/v2/conversations/messages/{conversationId}` with `state: disconnected`.

The inbound payload contains `channel.from` (opaque handoff UUID), `channel.time`,
`channel.messageId` and `text`. The old catch-all inbound endpoint is deliberately
not used: Genesys announces its retirement on 2026-10-05.

Outbound webhooks use `X-Hub-Signature-256` HMAC over the raw body. The endpoint
bounds input to 64 KB, checks the integration and opaque recipient, stores text
and its external ID in one transaction, then acknowledges. Duplicate delivery
IDs do not create duplicate chat messages. Late messages never reopen a completed
or resumed session. Non-text media is rejected explicitly; event and receipt
messages are acknowledged without creating chat messages.

## State and concurrency

`requested → waiting → human → completed`, with `closing`, `failed`, `uncertain`
and terminal `resumed` states. Active includes completed-but-not-resumed: AI
resumption is always explicit. A human transfer can temporarily return to waiting.
The worker never interprets a departed agent as overall completion while other
participants are still connected.

- A unique partial index permits one active handoff per Maiah conversation.
- The conversation row serializes handoff admission with new AI messages. A DB
  trigger rejects pending/streaming assistant messages while a handoff is active,
  including alternate generation entry points.
- Manual requests require the current AI stream to finish or stop first. A model
  tool can hand off only its own current interactive assistant message.
- The standard model loop stops using durable handoff state, even if invocation
  logging fails after acceptance. Text following an accepted tool result is not
  emitted. Normal tool approval and invocation audit remain in force.
- Sends and webhook writes are encrypted with the application's encryption key.
- The worker scans at most 25 sessions per cycle and processes one queued message
  per session, in order. PostgreSQL advisory locks coordinate replicas and resume
  requests; in-process overlap is suppressed. Claims are committed before HTTP.
- A claimed send older than two minutes is uncertain after restart. Transport
  failures and ambiguous HTTP failures are never automatically replayed.
- Token acquisition and status reads can be retried because they do not send a
  customer message. Known rejected message sends remain failed until the user
  resumes AI; resumption cancels unsent queued messages visibly.
- Resume disconnects the remote conversation and verifies all participants are
  terminal before unlocking AI. A successful PATCH alone does not unlock it.
- Grant checks join the current project organization, so moving a project revokes
  the previous organization's connection. Connection identity/grants cannot be
  changed while sessions remain active; credentials may be rotated and the
  connection disabled. Active sessions retain credentials needed for closure.
- Deleting a connection with an active session is rejected. After all sessions
  are resumed, organization deletion can remove connection/session metadata;
  stored conversation messages follow the existing personal-history policy.

## Recovery

An uncertain first send without a returned conversation ID needs reconciliation.
The organization panel lists active sessions. Locate the Genesys conversation
whose customer address is the displayed handoff UUID, enter its conversation ID,
and choose Verify and close. The server checks the customer address against the
remote conversation, then requests disconnection. It does not resend messages or
allow an administrator to attach an arbitrary customer's conversation.

If Genesys did not create a conversation and cannot establish that fact reliably,
Maiah keeps the session blocked: investigate with the Genesys administrator before
manual data remediation. This is an explicit unresolved-delivery state, not an
automatic retry path. Credential failures can be repaired through the same
organization form without changing the integration identity.

## Schema and APIs

Migration `0071_genesys_open_messaging.sql` adds connections, project grants,
sessions, deliveries and admission/deletion guards. Existing tool connections are
unchanged: V1 does not migrate unrelated MCP/ServiceNow credentials.

- `GET/PUT/POST /api/organizations/{organizationId}/genesys`: sanitized settings,
  save, connection test or verified reconciliation; organization.update required.
- `GET/POST /api/workspace/conversations/{conversationId}/handoff`: status,
  request, message or resume; owner plus effective project/agent permissions.
- `POST /api/webhooks/genesys/{connectionId}`: bounded signed provider ingress.

Management/chat endpoints require user sessions; API keys are rejected. Webhook
signatures authorize only the mapped integration/session, never a user account.

## Validation

The unit tests cover current payload shape, fixed regional endpoints, signed
bytes, HTTP ambiguity, state interpretation and non-interactive tool rejection.
PostgreSQL tests exercise real transactions, permissions, idempotency, AI guards,
credential rotation, encrypted history, webhook duplication, worker failure,
crash recovery and verified reconciliation with a simulated Genesys transport.
The Playwright test uses real authenticated routes and signed webhooks against a
production build, checks refresh and mobile overflow, and seeds the remote
verification result; it does not claim a real external consultant session.

A tenant-backed acceptance test remains a rollout prerequisite because no local
Genesys credentials are supplied. Local and CI test results are recorded in the
PR and Linear ticket.

## Primary references

- [Open Messaging overview](https://help.genesys.cloud/articles/open-messaging-overview/)
- [Integration setup](https://help.genesys.cloud/articles/configure-an-open-messaging-integration/)
- [OAuth clients](https://help.genesys.cloud/articles/create-an-oauth-client/)
- [Inbound endpoint retirement](https://help.genesys.cloud/announcements/deprecation-current-open-messaging-inbound-endpoint/)
- [Live Platform API contract](https://api.mypurecloud.ie/api/v2/docs/swagger)
