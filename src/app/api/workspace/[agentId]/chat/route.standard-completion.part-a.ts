import { generateChatAutomationArtifacts } from "@/modules/chat/automation";
import { consumeSkipNextChatSuggestions } from "@/modules/chat/suggestion-skip";
import { db } from "@/server/infrastructure/db";
import {
  conversations,
  messages,
} from "@/server/infrastructure/db/schema";
import { and, eq } from "drizzle-orm";

import type {
  ChatConversationRow,
  ChatMessageRow,
} from "./route.execution-context";
import type { StreamedPartWriter } from "./route.streamed-parts";

export function createPostCompletionAutomation(input: {
  conversation: ChatConversationRow;
  assistantMessage: ChatMessageRow;
  assistantText: string;
  content: string;
  shouldRegenerateConversationTitle: boolean;
  partWriter: StreamedPartWriter;
}) {
  const {
    conversation,
    assistantMessage,
    assistantText,
    content,
    shouldRegenerateConversationTitle,
    partWriter,
  } = input;
  return async () => {
    const shouldSkipSuggestions = consumeSkipNextChatSuggestions(
      conversation.id,
    );
    const artifacts = assistantText
      ? await generateChatAutomationArtifacts({
          userMessage: content,
          assistantText,
          fallbackTitle: conversation.title,
          generateSuggestions: !shouldSkipSuggestions,
        })
      : { title: conversation.title, suggestions: [] };
    const generatedTitle = shouldRegenerateConversationTitle
      ? artifacts.title
      : conversation.title;
    if (artifacts.suggestions.length > 0)
      await partWriter.appendSuggestions(artifacts.suggestions);
    if (
      shouldRegenerateConversationTitle &&
      generatedTitle.trim() &&
      generatedTitle.trim() !== conversation.title.trim()
    )
      await db.transaction(async (tx) => {
        const [ownedGeneration] = await tx
          .select({ id: messages.id })
          .from(messages)
          .where(
            and(
              eq(messages.id, assistantMessage.id),
              eq(messages.status, "completed"),
              eq(
                messages.streamGenerationId,
                assistantMessage.streamGenerationId!,
              ),
            ),
          )
          .for("update")
          .limit(1);
        if (!ownedGeneration) return;
        await tx
          .update(conversations)
          .set({ title: generatedTitle, updatedAt: new Date() })
          .where(eq(conversations.id, conversation.id));
      });
  };
}