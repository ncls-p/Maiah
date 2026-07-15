# Agent runtime bounds

Every model execution has explicit cumulative limits. Provider defaults are not
treated as a safety boundary.

## Interactive chat

- Tool calls are clamped to `0..50` per user message.
- Model output is clamped to `1..100000` tokens.
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

- A specialist has at least two model steps whenever tools or nested
  delegation are available: one action step and one final synthesis step.
- `maxChildSteps` bounds the complete specialist loop. On its last permitted
  step, tools and delegation are disabled so the model must answer from the
  results already collected.
- Legacy one-step policies are normalized to two steps. New policies below two
  steps are rejected by the API and editor.
- An empty final model response is a failed run (`AGENT_EMPTY_RESPONSE`), never
  a successful run with no answer.
- Each specialist receives an earlier local deadline than its parent,
  reserving up to 30 seconds for parent recovery and synthesis.
- New orchestrators default to a two-minute tree deadline. Administrators may
  configure up to five minutes for longer multi-specialist work.
- A specialist that crosses the cumulative token budget fails immediately and
  prevents further delegated work. If the parent model has already produced
  its terminal recovery text, that text is retained instead of being discarded
  after the tokens have already been consumed.

The shared policy lives in `src/modules/agent/runtime-policy.ts`. API validation
and the agent editor expose the same maxima so a saved configuration never
silently promises more than the runtime will execute.
