---
name: agent-orchestration
description: Design, implement, review, or debug bounded multi-agent orchestration in AI Hub. Use this skill whenever work mentions orchestrator agents, delegation to child or specialist agents, agent runs, delegation graphs, orchestration budgets, cancellation, leases, idempotency, or multi-agent runtime behavior—even when the request appears limited to an API route or UI tab.
metadata:
  version: "1.0.0"
  argument-hint: <orchestration-feature-or-incident>
---

# Agent Orchestration

Treat orchestration as a durable, permissioned execution tree. A successful model response is not enough if a retry can duplicate work, a child can exceed the root budget, or a trace can expose a secret.

## 1. Load the living contracts

Before changing orchestration behavior, read the relevant repository instructions and these documents:

- `../../../docs/architecture/orchestrator-run-model.md` for the run tree and terminal states;
- `../../../docs/architecture/agent-configuration-versioning.md` for atomic versions and bindings;
- `../../../docs/architecture/agent-runtime-bounds.md` for execution limits;
- `../../../docs/architecture/tool-approval-lifecycle.md` for non-interactive approvals;
- `../../../docs/architecture/codebase-guide.md` for module ownership and verification;
- the security documents under `../../../docs/security` when payloads, manifests, credentials, logs, or previews change.

Inspect the schema, migration, use cases, runtime executor, API routes, worker entry point, UI, messages, and tests that implement the contract. Do not infer runtime guarantees from the editor alone.

## 2. Preserve the orchestration invariants

Every change must keep these properties true:

1. The initiating principal is propagated to every child. Recheck `agents.delegate` and resource visibility at execution time.
2. Delegation bindings pin an exact child version. Later edits never alter an existing configuration or run.
3. Reject self-delegation, duplicate bindings, inaccessible children, and indirect cycles before activation; keep runtime ancestry checks as defense in depth.
4. Store a durable root/parent/child run tree with explicit queued, running, waiting, success, failed, cancelled, and timed-out transitions.
5. Enforce depth, total delegations, parallel children, child steps, tree tokens, deadline, and returned-result size in both configuration and runtime.
6. Reserve root quota transactionally, count concurrent reservations, and settle, release, or expire it exactly once.
7. Make creation idempotent and claims lease-based. Never replay an external side effect automatically after an ambiguous failure.
8. Propagate cancellation and deadlines through one abort tree; converge stale deadlines and lost leases to terminal states.
9. Fail closed when a child tool requires interactive approval. A background or child run cannot silently self-approve.
10. Encrypt raw inputs and outputs. Persist and return only redacted previews, safe errors, and minimum operational metadata.

Same-workspace delegation, immutable agent type, and non-publishable orchestrators are V1 product constraints. Do not widen them accidentally while implementing an adjacent request.

## 3. Implement vertically

Work in reviewable slices:

1. Characterize the current behavior and record the clean baseline.
2. Add an append-only migration when persistence changes; validate fresh install and upgrade on PostgreSQL.
3. Put graph, permission, version, quota, and transition rules in `src/modules`, with transactions around multi-table invariants.
4. Keep route handlers thin: authenticate, validate, authorize, call a use case, and map typed conflicts to stable HTTP responses.
5. Use the shared runtime for chat, dry runs, API calls, and scheduled tasks so no entry point bypasses bounds or audit.
6. Expose configuration readiness, pinned specialists, budgets, dry run, history, cancellation, partial failure, and retry guidance in the UI.
7. Add FR and EN copy together, including accessible names and all error/progress/terminal states.
8. Update architecture, security, workflow, migration, and operations documentation in the same slice.

## 4. Model failures explicitly

Cover at least:

- missing or stale child version;
- revoked delegation permission;
- cycle detected before save and at runtime;
- root delegation, parallel, token, step, output, or deadline budget exhausted;
- quota admission rejected while other reservations are active;
- cancellation before claim, during a model call, and during a child run;
- lease heartbeat loss and process restart;
- duplicate idempotency key for active and completed runs;
- atomic completion or usage-write conflict;
- child approval requirement in non-interactive execution;
- provider, tool, or child failure with safe previews and an intact parent history.

An error must not become a false empty state, a silent retry, or an unbounded fallback.

## 5. Verify at the invariant boundary

Use the narrowest test that proves each guarantee, then run the full gates:

- pure tests for policy normalization, cycle detection, redaction, and budget arithmetic;
- database/use-case tests for version conflicts, quota concurrency, idempotency, claims, settlement, cancellation, and reaping;
- runtime tests for pinned children, permission rechecks, approval failure, abort propagation, tool instrumentation, and tree usage;
- route tests for auth, workspace isolation, validation, 403, 404, and 409 responses;
- Playwright for orchestrator creation, specialist configuration, dry run/history, cancellation, responsive layout, keyboard access, and destructive confirmation;
- real PostgreSQL migration, coverage thresholds, lint, typecheck, production build, and worker smoke.

Do not lower a coverage, timeout, quota, or security threshold merely to make a gate pass. Add the missing characterization or fix the violated contract.

## 6. Handoff

Report the delivered invariant, migration impact, user-visible workflow, test evidence, and any external integration that still needs deployment credentials. Keep V1 limitations visible in both UI and documentation.
