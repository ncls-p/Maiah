import { randomUUID } from "node:crypto";

import { eq,inArray } from "drizzle-orm";
import { expect } from "vitest";

import { encryptValue } from "@/lib/crypto";
import { claimAssistantContinuation } from "@/modules/chat/continuation";
import { db } from "@/server/infrastructure/db";
import { conversations,messageParts,messages } from "@/server/infrastructure/db/schema";
import type { IamDatabaseScenarioContext } from "./iam-use-cases-db.context";

export async function runIamDatabaseScenario5(context: IamDatabaseScenarioContext) {
  const { ownerId } = context;
  const { secondProjectId, sharedAgentId } = context;
    const conversationId = randomUUID();
    const userMessageId = randomUUID();
    const assistantMessageId = randomUUID();
    const laterUserMessageId = randomUUID();

    try {
      await db.insert(conversations).values({
        id: conversationId,
        workspaceId: secondProjectId,
        agentId: sharedAgentId,
        userId: ownerId,
        title: "Continuation persistence",
      });
      await db.insert(messages).values([
        {
          id: userMessageId,
          conversationId,
          role: "user",
          status: "completed",
          completedAt: new Date(),
          createdAt: new Date(Date.now() - 1_000),
        },
        {
          id: assistantMessageId,
          conversationId,
          role: "assistant",
          status: "completed",
          tokenInput: 10,
          tokenOutput: 20,
          completedAt: new Date(),
        },
      ]);
      await db.insert(messageParts).values([
        {
          messageId: userMessageId,
          type: "text",
          contentEncrypted: await encryptValue("Explain the result."),
          sortOrder: 0,
        },
        {
          messageId: assistantMessageId,
          type: "text",
          contentEncrypted: await encryptValue("First half."),
          sortOrder: 0,
        },
        {
          messageId: assistantMessageId,
          type: "suggestions",
          contentEncrypted: await encryptValue('["Ask more"]'),
          sortOrder: 1,
        },
      ]);

      const claim = await claimAssistantContinuation({
        conversationId,
        messageId: assistantMessageId,
        providerId: null,
        modelId: "continuation-test-model",
      });

      expect(claim).toMatchObject({
        status: "claimed",
        message: {
          id: assistantMessageId,
          status: "streaming",
          tokenInput: 10,
          tokenOutput: 20,
        },
        nextSortOrder: 1,
        appendableTextPart: { content: "First half." },
      });
      const persistedMessages = await db.select({ id: messages.id, role: messages.role }).from(messages).where(eq(messages.conversationId, conversationId));
      expect(persistedMessages).toHaveLength(2);
      expect(persistedMessages.filter((message) => message.role === "assistant")).toEqual([{ id: assistantMessageId, role: "assistant" }]);

      const persistedParts = await db.select({ type: messageParts.type }).from(messageParts).where(eq(messageParts.messageId, assistantMessageId));
      expect(persistedParts).toEqual([{ type: "text" }]);

      await expect(
        claimAssistantContinuation({
          conversationId,
          messageId: assistantMessageId,
          providerId: null,
          modelId: "continuation-test-model",
        }),
      ).resolves.toEqual({ status: "already_streaming" });
      await expect(
        claimAssistantContinuation({
          conversationId,
          messageId: randomUUID(),
          providerId: null,
          modelId: "continuation-test-model",
        }),
      ).resolves.toEqual({ status: "not_found" });

      await db.insert(messages).values({
        id: laterUserMessageId,
        conversationId,
        role: "user",
        status: "completed",
        completedAt: new Date(),
        createdAt: new Date(Date.now() + 1_000),
      });
      await expect(
        claimAssistantContinuation({
          conversationId,
          messageId: assistantMessageId,
          providerId: null,
          modelId: "continuation-test-model",
        }),
      ).resolves.toEqual({ status: "not_latest" });
    } finally {
      await db.delete(messageParts).where(inArray(messageParts.messageId, [userMessageId, assistantMessageId, laterUserMessageId]));
      await db.delete(messages).where(eq(messages.conversationId, conversationId));
      await db.delete(conversations).where(eq(conversations.id, conversationId));
    }
  
}
