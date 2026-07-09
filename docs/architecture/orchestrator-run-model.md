# Orchestrator and durable run model

An agent is created as either an `assistant` or an `orchestrator`. The kind is
immutable; changing behavior requires creating or cloning another agent. This
keeps historical runs and permission decisions understandable.

Orchestration policy and delegation bindings belong to an immutable agent
version. Each binding pins both a child agent and a specific child version, so a
parent run cannot change behavior halfway through because a child was edited.

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

## Authorization

Every child call requires `agents.delegate` at runtime, in addition to normal
visibility and agent-use checks. Current built-in workspace roles include this
permission. Custom roles and API keys do not gain it implicitly, preserving
default-deny behavior for existing delegated credentials.

Migration `0028_orchestrator_run_foundation.sql` adds database checks, pinned
version foreign keys, idempotency uniqueness, self-referential run constraints,
and an immutable-kind trigger.
