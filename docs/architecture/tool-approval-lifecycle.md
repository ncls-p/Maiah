# Tool approval lifecycle

Tool approval is a compare-and-set state machine. The encrypted invocation row
is the execution source of truth; browser payloads are display-only projections.

## State transitions

```text
awaiting_approval --approve--> running --success--> success
                                  |
                                  +--execution error--> failed

awaiting_approval --reject--> rejected
awaiting_approval --timeout--> failed
```

Only an atomic `UPDATE ... WHERE status = 'awaiting_approval' RETURNING ...`
may claim an invocation. An approval request that observes `running` or
`success` is an idempotent success and never executes the tool again. A reject
request repeated after `rejected` is also an idempotent success. Opposite or
terminal decisions return `409`.

The approval waiter may time out only a row that is still
`awaiting_approval`; it cannot overwrite a concurrently claimed `running`
invocation.

## Payload boundary

Raw inputs and outputs are encrypted at rest because the executor needs their
full fidelity. They must not be returned directly by invocation APIs, approval
events, logs, audit metadata, or UI components.

`projectToolPayloadForDisplay` is the shared outbound boundary. It:

- redacts credential, token, password, authorization, cookie, environment and
  signature values;
- removes credentials and sensitive query parameters from URLs;
- replaces data URLs and obvious bearer/JWT/private-key strings;
- bounds nesting, collection size and string length;
- preserves non-secret execution context such as paths, queries and token
  limits so that an approver can still make an informed decision.

The projection must never be passed back to an executor. Approval always
decrypts the original invocation row after the compare-and-set claim succeeds.
