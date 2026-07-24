# Workflow agentic execution

## Builder sequence

Every agentic workflow turn follows a server-enforced sequence:

1. automatic live web research;
2. `set_workflow_plan`;
3. `update_todo_list`;
4. graph edits;
5. `validate_workflow`;
6. isolated sandbox checks when relevant;
7. a non-executing `dry_run_workflow`;
8. an optional `request_workflow_run`.

Graph mutations fail until a plan exists. A run request fails until the current
draft has been validated and dry-run. The visible to-do list is stored per
workflow and user so progress survives reloads.

## Human-approved runs

`request_workflow_run` only records the intent during model execution. The
server saves the tested workflow version first, then creates a durable approval
request pinned to that exact version.

The raw input is encrypted. Only a bounded, secret-aware preview crosses the UI
boundary. Approval uses a compare-and-set transition from `pending` to
`approving`, and run creation uses the request ID as an idempotency key. Reject,
expire, approve, and fail are terminal decisions; the model cannot approve its
own request.

After approval, the UI opens the created run and refreshes queued/running state
until it becomes terminal.

## Debugging

Each run stores node input, output, attempt, status, and the node error. The run
detail displays both sides of every step. Runtime errors include the node label,
ID, and underlying safe error when available.

The `debug.snapshot` node is a pass-through node: it returns its input unchanged
while causing that exact value to be captured as the node input and output in
the run trace. It has no external side effect.

## Chat to-do lists

Classic chat agents always receive `update_todo_list` when tool calling is
enabled. The tool emits a complete snapshot with stable item IDs and
`pending`/`in_progress`/`completed` states. Tool results are normal persisted
chat message parts, so the list renders during streaming and after history
reload.
