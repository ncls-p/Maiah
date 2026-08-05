import { parseToolPart,toolNameMatches,type ChatMessagePart,type PendingToolApproval } from "@/components/chat/chat-types";
import { projectToolPayloadForDisplay } from "@/modules/tool/safe-payload";
import { stringifyForMatch } from "./chat-message-rendering-utils.stringify-for-match";

export function toolPartMatchesApproval(part: ChatMessagePart, pendingApproval: PendingToolApproval | null | undefined) {
  if (!pendingApproval || part.type !== "tool-call") return false;
  const parsed = parseToolPart(part.content);
  return toolNameMatches(parsed.toolName, pendingApproval.toolName) && (parsed.input === undefined || stringifyForMatch(pendingApproval.input) === stringifyForMatch(projectToolPayloadForDisplay(parsed.input)));
}
