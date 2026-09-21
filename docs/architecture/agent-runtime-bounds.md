# Agent runtime bounds

Every model execution remains bounded by the selected model, workspace quota,
authorization and explicit cancellation. Agent-level limits may be set to `0`
when the owner wants the runtime to use those external bounds directly.

## Interactive chat

- `0` output tokens means the model's advertised maximum; a positive value is
  an agent-specific ceiling. The context window can still reduce it. If the
  provider has no positive output limit, the fallback is 16,384 tokens, never
  the entire context window. This fallback does not cap the input context.
- Before quota admission, the final SDK request is fitted again using its
  system/messages, resolved tool schemas and response format. UTF-8 estimates
  and a proportional safety margin reduce the output reservation without
  deleting the user's history. Binary transport size is not used as an image
  token count; multimodal accounting remains an estimate.
- One explicit HTTP 400 context rejection with usable provider input/output
  counts may reduce the output reservation and retry the model call once.
  Already-open streams, ambiguous errors, and inputs that already fill the
  window are never replayed. Completed tools are not re-executed.
- With conversation memory enabled, a missing or `0` summary threshold is
  model-relative: reserve the greater of 16,384 tokens and 15% of the window,
  capped at half the window for small models. Positive saved thresholds remain
  unchanged. Unknown windows retain the 24,000-token fallback threshold.
- The loop stops after one step without tools, or after at most
  `maxToolCalls + 2` steps with tools. The extra steps allow tool results to be
  synthesized into a final answer.
- Once the tool-call budget is consumed, the next step receives no active tools
  and must answer from the information already collected.
- A run has a 120-second deadline combined with the user's cancellation signal.
  A user cancellation completes the partial message; a deadline is reported as
  a failed run with a retryable, user-facing explanation.

## Supporting model calls

- The custom-tool builder is limited to 12 model steps, 20 tool actions, 4000
  output tokens and 120 seconds.
- Scheduled-task generation has a 120-second deadline and remains capped at
  4000 output tokens.
- Title, suggestion and connection-test model calls have a 30-second deadline.

## Orchestrated runs

- New orchestrators default to `maxTotalTokens: 0`: no arbitrary 50,000-token
  tree cap. Provider limits and workspace quota still apply. Existing explicit
  tree budgets are preserved; depth, parallelism and step defaults stay bounded.
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

## Reference implementations

The design was compared with [OMP compaction](https://github.com/can1357/oh-my-pi/blob/97f945c130d9dc1cb026932adb415359217a2fad/docs/compaction.md),
[OMP reserves](https://github.com/can1357/oh-my-pi/blob/97f945c130d9dc1cb026932adb415359217a2fad/docs/settings.md),
and [Pi's subagent example](https://github.com/badlogic/pi-mono/blob/7f06f9cf1626504cde95683f1c81a72a7bc7a0cb/packages/coding-agent/examples/extensions/subagent/README.md).
Maiah independently implements the applicable patterns: isolated specialist
context, model-relative headroom, bounded overflow recovery, final-result-only
handoff, and propagated cancellation. OMP's process/hub lifecycle is not copied;
Maiah retains durable runs, permissions, pinned versions and quota settlement.
This change does not introduce autonomous child-session compaction or implicit
parent-history inheritance. Specialists still receive the explicit mission and
authorized attachment context; their runtime fits each subsequent model call.
