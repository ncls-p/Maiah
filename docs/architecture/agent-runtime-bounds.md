# Agent runtime bounds

Every model execution remains bounded by the selected model, workspace quota,
authorization and explicit cancellation. Agent-level limits may be set to `0`
when the owner wants the runtime to use those external bounds directly.

## Interactive chat

- `0` output tokens means the model's advertised maximum; a positive value is
  an agent-specific ceiling. The context window can still reduce it.
- The loop stops after one step without tools, or after at most
  `maxToolCalls + 2` steps with tools. The extra steps allow tool results to be
  synthesized into a final answer.
- Once the tool-call budget is consumed, the next step receives no active tools
  and must answer from the information already collected.
- A run has a 120-second deadline combined with the user's cancellation signal.
  A user cancellation completes the partial message; a deadline is reported as
  a failed run with a retryable, user-facing explanation.
- An attached code workspace replaces general chat capabilities with the
  bounded `read`, `edit`, `write`, and `bash` surface. Bash keeps the sandbox
  command timeout and restricted-tool approval boundary inside the cumulative
  chat limits.

## Supporting model calls

- The custom-tool builder is limited to 12 model steps, 20 tool actions, 4000
  output tokens and 120 seconds.
- Scheduled-task generation has a 120-second deadline and remains capped at
  4000 output tokens.
- Title, suggestion and connection-test model calls have a 30-second deadline.

## Orchestrated runs

- A specialist has at least two model steps whenever tools or nested
  delegation are available: one action step and one final synthesis step.
- The active agent version's `toolChoice` (`auto`, `required`, or `none`) is
  honored on action steps. The final synthesis step still disables tools.
- Configuring specialists is not capped by `maxDelegations`: every visible
  specialist may be pinned to an orchestrator version. `maxDelegations` only
  limits delegation calls consumed during one root run.
- `0` means unlimited for depth, delegation calls, parallel specialists,
  specialist steps, tree tokens, deadline and returned specialist text. It
  removes the agent-specific ceiling; cycle detection, provider constraints,
  workspace quota, permissions and explicit cancellation remain active.
- `maxChildSteps` bounds the complete specialist loop. On its last permitted
  step, tools and delegation are disabled so the model must answer from the
  results already collected.
- Legacy one-step policies are normalized to two steps. New policies below two
  steps are rejected by the API and editor.
- An empty final model response is a failed run (`AGENT_EMPTY_RESPONSE`), never
  a successful run with no answer.
- If a model stops early with no text after at least one successful tool result,
  the runtime performs one bounded, tool-free synthesis pass over a
  secret-aware text projection of those results. It does not replay provider
  `tool-call` messages without tool definitions. Its tokens and elapsed time
  count against the same tree budget. If that optional synthesis is empty or
  fails, the runtime returns a bounded, secret-aware deterministic projection
  of the completed tool results instead of discarding successful work.
- If a provider hits the local run deadline after one or more tools completed,
  the same deterministic projection completes the run. Usage from every
  completed model step is retained through the AI SDK step callback. Explicit
  user cancellation never takes this recovery path.
- Each specialist receives an earlier local deadline than its parent,
  reserving up to 30 seconds for parent recovery and synthesis.
- New orchestrators default to no tree deadline. Administrators may configure
  any positive duration in milliseconds, or keep `0` so execution continues
  until completion or explicit cancellation. Finite deadlines still propagate
  through the complete run tree.
- A specialist that crosses the cumulative token budget fails immediately and
  prevents further delegated work. If the parent model has already produced
  its terminal recovery text, that text is retained instead of being discarded
  after the tokens have already been consumed.

The shared policy lives in `src/modules/agent/runtime-policy.ts`. API validation
and the agent editor share the same `0` semantics so saved configurations and
runtime behavior stay aligned.
