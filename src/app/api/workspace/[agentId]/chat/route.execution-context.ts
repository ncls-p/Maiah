import type { resolveProviderForVersion } from "@/modules/agent/use-cases";
import type { AssistantContinuationClaim } from "@/modules/chat/continuation";
import type {
  agents,
  conversations,
  messages,
} from "@/server/infrastructure/db/schema";
import type { ModelMessage } from "ai";
import type { ChatAttachment } from "@/modules/chat/attachments";
import type { ReasoningPreset } from "@/modules/agent/reasoning-presets";

export type ChatAgentRow = typeof agents.$inferSelect;
export type ChatConversationRow = typeof conversations.$inferSelect;
export type ChatMessageRow = typeof messages.$inferSelect;
export type ChatProviderConfig = NonNullable<
  Awaited<ReturnType<typeof resolveProviderForVersion>>
>;
export type ChatAgentVersion = NonNullable<
  Awaited<
    ReturnType<typeof import("@/modules/agent/use-cases").getActiveVersion>
  >
>;
export type ClaimedContinuation = Extract<
  AssistantContinuationClaim,
  { status: "claimed" }
>;

export type ChatExecutionContext = {
  requestId: string;
  agentId: string;
  actorUserId: string;
  agent: ChatAgentRow;
  version: ChatAgentVersion;
  providerConfig: ChatProviderConfig;
  conversation: ChatConversationRow;
  userMessage: ChatMessageRow | null;
  assistantMessage: ChatMessageRow;
  continuationClaim: ClaimedContinuation | null;
  content: string;
  history: ModelMessage[];
  generationHistory: ModelMessage[];
  availableAttachments: ChatAttachment[];
  useAiSdkUIStream: boolean;
  shouldRegenerateConversationTitle: boolean;
  reasoningEffort?: ReasoningPreset;
  codeWorkspaceId?: string;
  capabilityOverrides?: {
    disabledTools: Array<{ source: "builtin" | "mcp" | "custom"; id: string }>;
    disabledSkillIds: string[];
    enabledTools: Array<{ source: "builtin" | "mcp" | "custom"; id: string }>;
    enabledSkillIds: string[];
    enabledKnowledgeIds: string[];
  };
};

export function chatStreamHeaders(context: ChatExecutionContext) {
  return {
    "X-Conversation-Id": context.conversation.id,
    "X-Message-Id": context.assistantMessage.id,
    ...(context.assistantMessage.streamGenerationId
      ? {
          "X-Stream-Generation-Id": context.assistantMessage.streamGenerationId,
        }
      : {}),
    ...(context.userMessage
      ? { "X-User-Message-Id": context.userMessage.id }
      : {}),
    "X-Conversation-Ephemeral": String(context.conversation.isEphemeral),
    ...(context.conversation.expiresAt
      ? {
          "X-Conversation-Expires-At":
            context.conversation.expiresAt.toISOString(),
        }
      : {}),
    "X-Request-Id": context.requestId,
  };
}
