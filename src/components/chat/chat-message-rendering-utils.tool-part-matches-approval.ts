import {
  parseToolPart,
  toolNameMatches,
  type ChatFileAttachment,
  type ChatImageAttachment,
  type ChatMessage,
  type ChatMessagePart,
  type PendingToolApproval,
} from "@/components/chat/chat-types";
import { isCodeWorkspaceArtifactOutput } from "@/components/chat/code-workspace-artifact-card";
import { summarizeToolInput } from "@/components/chat/tool-approval-banner";
import {
  chatTodoListFromUnknown,
  type ChatTodoList,
} from "@/modules/chat/todo-list";
import { projectToolPayloadForDisplay } from "@/modules/tool/safe-payload";
import { stringifyForMatch } from "./chat-message-rendering-utils.stringify-for-match";


export function toolPartMatchesApproval(
  part: ChatMessagePart,
  pendingApproval: PendingToolApproval | null | undefined,
) {
  if (!pendingApproval || part.type !== "tool-call") return false;
  const parsed = parseToolPart(part.content);
  return (
    toolNameMatches(parsed.toolName, pendingApproval.toolName) &&
    (parsed.input === undefined ||
      stringifyForMatch(pendingApproval.input) ===
        stringifyForMatch(projectToolPayloadForDisplay(parsed.input)))
  );
}
