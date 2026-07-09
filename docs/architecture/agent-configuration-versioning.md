# Agent configuration versioning

An agent's runtime configuration is immutable once active. Every save creates a
new `agent_versions` row and activates it only after all of its bindings are
valid and persisted.

## Atomic save contract

Every update command carries `baseVersionId`, the active version observed by
the client. The server locks the agent row with a compare-and-set predicate. If
the active version has changed, the whole transaction is rejected with HTTP
`409`:

```json
{
  "error": "Agent configuration changed since it was loaded",
  "code": "AGENT_VERSION_CONFLICT",
  "currentVersionId": "..."
}
```

The client must reload before reapplying the user's choices. It must not retry
blindly against the new version.

The following data is committed in one database transaction:

- the new versioned model, prompt, generation, memory, guardrail and approval
  settings;
- tool bindings and their approval policy;
- knowledge-base bindings;
- skill bindings;
- the agent's `activeVersionId` pointer;
- identity/curation changes included in the same command.

Agent creation and cloning use the same transaction boundary. A validation or
binding failure therefore leaves no active partial version.

## API behavior

`PATCH /api/workspace/agents/:agentId` accepts all three binding collections in
the same command. The agent editor uses this endpoint for a single capability
save; it no longer issues three parallel requests.

The older `/tools`, `/knowledge` and `/skills` update routes remain for existing
clients. Each requires `baseVersionId` and delegates to the same version command,
which clones unchanged binding collections inside the transaction.

Binding reads are load-bearing. A client must never replace a failed binding
GET with an empty array and then submit it. The agent editor aborts loading when
any binding request fails, and the knowledge attachment flow performs no
mutation after a failed binding read.
