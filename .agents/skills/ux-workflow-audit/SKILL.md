---
name: ux-workflow-audit
description: Audit and improve complete product workflows across roles, permissions, loading, empty, error, conflict, retry, mobile, keyboard, and destructive-action states. Use this skill whenever a user asks to review UX, simplify user journeys, remove UI overload, find likely workflow bugs, polish an application end to end, or add an agent/orchestrator workflow—even if they only mention one screen.
metadata:
  version: "1.0.0"
  argument-hint: <route-or-workflow-scope>
---

# UX Workflow Audit

Treat a workflow as a state machine, not a collection of screenshots. A polished happy path is insufficient when a failed request can look like an empty account or a stale permission check can expose the wrong action.

## 1. Establish the product contract

Before editing:

1. Read the repository instructions and the relevant UI, accessibility, framework, and component-system skills.
2. Identify roles, permissions, resources, entry points, exits, and irreversible actions.
3. Trace the real API and persistence behavior behind the UI. Do not invent capabilities from labels alone.
4. Record the existing test, lint, typecheck, and build baseline so pre-existing failures stay distinguishable.
5. Preserve unrelated user changes and work in reviewable commits.

## 2. Build the journey matrix

For every in-scope workflow, cover:

- first use and returning use;
- loading, success, empty, filtered-empty, and partial data;
- initial load failure and background refresh failure;
- validation, API rejection, optimistic rollback, and version conflict;
- signed out, insufficient permission, read-only, and admin variants;
- double submission, stale tab, back/forward navigation, refresh, and direct URL entry;
- desktop, narrow mobile, keyboard-only, screen reader naming, reduced motion, and long translated copy;
- destructive actions, cancellation, recovery, and audit visibility.

Use `references/state-contract.md` as the minimum state checklist.

## 3. Simplify before decorating

Reduce cognitive load in this order:

1. Give the page one clear purpose and one primary action.
2. Remove duplicate CTAs, permanent tutorials, decorative counters, and stats that do not change a decision.
3. Move expert configuration behind progressive disclosure without hiding required setup.
4. Keep labels concrete and outcome-oriented; explain consequences near risky controls.
5. Preserve user context after recoverable failures. Do not redirect away merely because a request failed.
6. Keep filters and selected tabs in the URL when users benefit from reload, back, or sharing.

Visual polish should reinforce hierarchy: consistent spacing, restrained surfaces, visible focus, stable loading geometry, touch targets of at least 40px where practical, and motion that respects reduced-motion preferences.

## 4. Enforce the state contract

- Never render an empty state after a failed load.
- Never show stale data as if it belongs to a newly selected resource.
- Keep the last valid data during background refresh failures and show a persistent retry affordance.
- Disable conflicting mutations until the source state is verified.
- Prevent duplicate submissions and expose progress on the initiating control.
- Make permission checks fail closed.
- Show version conflicts as actionable reload/reconcile states, not generic errors.
- Treat clipboard, download, upload, export, and navigation failures as real outcomes.
- Localize visible copy, accessible names, dates, numbers, plurals, and generated default prompts.

## 5. Agent and orchestrator workflows

When agents can delegate to other agents, additionally verify:

- assistant versus orchestrator is an explicit immutable choice;
- specialist selection only exposes authorized, compatible, active versions;
- self-delegation, duplicates, indirect cycles, and invisible agents are rejected server-side;
- saved bindings pin versions so later edits cannot silently change an existing run;
- depth, delegation, parallelism, step, token, time, and result-size budgets are visible and enforced;
- dry-run, run history, safe previews, cancellation, timeout, and terminal failure states are usable;
- non-interactive execution fails closed when a human approval would be required;
- traces redact secrets and preserve parent/child relationships;
- quota reservations and settlement are safe under retries, leases, and concurrent requests.

## 6. Verification

Test in layers:

1. Pure and unit tests for transitions, permissions, budgets, cycles, and localized helpers.
2. API/integration tests for atomic writes, conflicts, idempotency, cancellation, and redaction.
3. Browser tests for the happy path plus at least initial error, validation, permission, mobile overflow, and keyboard focus.
4. Lint, typecheck, full tests, and production build in the repository's supported runtime.
5. Database migrations against the real database engine in CI when local infrastructure is unavailable; document that limitation explicitly.

Use real DOM inspection in addition to screenshots. A visually plausible screenshot does not prove correct semantics, focus order, overflow, or autocomplete attributes.

## 7. Documentation and handoff

Update:

- the workflow matrix with implemented and deferred scenarios;
- architecture and API documentation for new domain behavior;
- migration and operational notes;
- skill guidance when a repeated failure pattern should become a repository rule.

Report what was verified, what could not be verified locally, and the exact remaining gate. Do not claim authenticated browser coverage when the database or identity provider was unavailable.
