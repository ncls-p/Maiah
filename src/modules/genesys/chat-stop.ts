import { currentHandoff } from "./sessions";
// Durable state wins even if tool invocation logging failed after accepting a handoff.
export async function shouldStopForHandoff(
  conversationId: string,
  toolNames: string[],
) {
  return (
    toolNames.includes("request_human_handoff") &&
    Boolean(await currentHandoff(conversationId))
  );
}
