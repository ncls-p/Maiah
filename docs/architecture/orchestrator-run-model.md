# Orchestrator and durable run model

An agent is created as either an `assistant` or an `orchestrator`. The kind is
immutable; changing behavior requires creating or cloning another agent. This
keeps historical runs and permission decisions understandable.

Orchestration policy and delegation bindings belong to an immutable agent
version. Each binding pins both a child agent and a specific child version, so a
parent run cannot change behavior halfway through because a child was edited.
Creation accepts `kind: "orchestrator"`; later updates cannot change that kind.
The versioned policy and bindings can be read or replaced through
`/api/workspace/agents/:agentId/delegations`. Replacement uses the same
`baseVersionId` compare-and-swap contract as the rest of the agent editor.

Bindings are accepted only when every child is currently visible to the editor,
belongs to the same workspace, and the pinned version belongs to that child.
Duplicate children, direct self-delegation and indirect cycles through pinned
versions are rejected before activation. Agent marketplace manifests reject
orchestrators in V1 so a package cannot silently omit its delegation graph.

## Durable run tree

`agent_runs` records every root and delegated execution with:

- trigger and actor principal;
- workspace, agent and pinned version;
- root/parent linkage and depth;
- encrypted input/output plus safe display projections;
- idempotency key, deadline, cancellation request and worker lease;
- reservation and settled token counters;
- terminal status and safe error information.

`agent_run_steps` stores the ordered model, tool, approval and delegation trace.
Only safe projections are stored there. `workspace_token_reservations` tracks
admission-control reservations independently from settled usage and supports
expiry/reaping after crashes.

## Admission and execution guarantees

Root runs reserve their maximum token budget before execution. Monthly quota
admission is serialized per workspace and includes both settled usage and every
active reservation, so concurrent runs cannot individually pass a stale quota
check. Child runs consume the root reservation instead of reserving the same
budget again.

Workers claim only queued runs and renew a short lease while executing. A lost
lease is terminal: the reaper marks the run failed and releases its reservation
instead of replaying it automatically. This deliberately avoids presenting
at-most-once database claiming as exactly-once execution when tools may have
external side effects. Callers that retry must provide an idempotency key.

Raw run input and output are encrypted. List/detail responses and run steps use
bounded, secret-aware projections, while unexpected terminal errors fall back
to a generic message when redaction would otherwise reveal sensitive material.

## Runtime entry points

The shared executor powers orchestrator chat and scheduled tasks. It can also be
called synchronously through:

- `POST /api/workspace/agents/:agentId/runs` to run or dry-run a pinned or active
  version;
- `GET /api/workspace/agents/:agentId/runs` for bounded run history;
- `GET /api/workspace/agents/:agentId/runs/:runId` for the safe run tree trace;
- `DELETE /api/workspace/agents/:agentId/runs/:runId` to request cancellation.

API callers may supply an idempotency key. A completed duplicate returns the
encrypted run result without another model call; a duplicate still in progress
returns a conflict with the existing run ID.

Every delegation rechecks `agents.delegate`, target visibility, pinned-version
ownership, ancestry and depth immediately before creating the child run. The
root policy bounds total delegations, parallel children, child steps, output
size, whole-tree tokens and wall-clock time. Root quota settlement uses the
whole-tree token count rather than only the parent model call.

Scheduled, delegated and direct API executions are non-interactive. A tool that
requires human approval is denied and logged instead of waiting forever. Chat
assistants keep the existing interactive approval flow; orchestrator child runs
use the same fail-closed non-interactive rule in V1.

## Authorization

Every child call requires `agents.delegate` at runtime, in addition to normal
visibility and agent-use checks. Current built-in workspace roles include this
permission. Custom roles and API keys do not gain it implicitly, preserving
default-deny behavior for existing delegated credentials.

Migration `0028_orchestrator_run_foundation.sql` adds database checks, pinned
version foreign keys, idempotency uniqueness, self-referential run constraints,
and an immutable-kind trigger.
