import { APICallError } from "@ai-sdk/provider";

/** Only recover an explicit pre-generation rejection with provider token counts.
 * Unknown errors, full inputs, timeouts and already-open streams are not replayed.
 */
export function reducedOutputAfterContextRejection(
  error: unknown,
  requested: number | undefined,
): number | undefined {
  if (
    !APICallError.isInstance(error) ||
    error.statusCode !== 400 ||
    !requested ||
    !Number.isFinite(requested)
  )
    return;
  let message = error.message;
  try {
    const body = JSON.parse(error.responseBody ?? "{}");
    if (typeof body?.error?.message === "string") message = body.error.message;
  } catch {
    /* A plain provider message can carry the same exact counts. */
  }
  const maximum = message.match(/maximum context length is (\d+) tokens/i);
  const input = message.match(
    /prompt contains (?:at least )?(\d+) input tokens/i,
  );
  const output = message.match(/requested (\d+) output tokens/i);
  if (!maximum || !input || !output) return;
  const window = Number(maximum[1]);
  const inputTokens = Number(input[1]);
  if (
    ![window, inputTokens, Number(output[1])].every(Number.isSafeInteger) ||
    Number(output[1]) !== requested ||
    inputTokens + requested <= window
  )
    return;
  const available =
    window - inputTokens - Math.max(1_024, Math.ceil(inputTokens * 0.15));
  if (available > 0 && available < requested) return available;
}
