import { and, desc, eq, inArray } from "drizzle-orm";

import { decryptValue } from "@/lib/crypto";
import { logHandledWarning } from "@/lib/logger";
import { projectAgentProgressForModelHistory } from "@/modules/agent/progress-model-history";
import {
  getChatImageAttachmentBytes,
  isChatFileAttachment,
  isChatImageAttachment,
} from "@/modules/chat/attachments";
import { db } from "@/server/infrastructure/db";
import {
  conversations,
  messageParts,
  messages,
} from "@/server/infrastructure/db/schema";
import type { ModelMessage } from "ai";
import {
  codeSandboxContextFromToolMetadata,
  codeWorkspaceContextFromToolMetadata,
  htmlArtifactCodeFromToolMetadata,
  mergeHistoryWithAttachmentMessages,
  sandboxAttachmentExplorerPathHint,
  sandboxAttachmentPathHint,
  toolMetadataForModelHistory,
} from "./route-history.merge-history-with-attachment-messages";

export async function loadConversationHistory(
  conversationId: string,
  context: { workspaceId: string; userId: string },
  summaryOrLegacyLimit?:
    | boolean
    | number
    | { summaryEnabled?: boolean; maxMessages?: number },
): Promise<ModelMessage[]> {
  const historyLimit =
    typeof summaryOrLegacyLimit === "number" && summaryOrLegacyLimit > 0
      ? Math.floor(summaryOrLegacyLimit)
      : typeof summaryOrLegacyLimit === "object" &&
          Number.isFinite(summaryOrLegacyLimit.maxMessages)
        ? Math.max(2, Math.floor(summaryOrLegacyLimit.maxMessages ?? 2))
        : null;
  const summaryEnabled =
    summaryOrLegacyLimit === true ||
    (typeof summaryOrLegacyLimit === "object" &&
      summaryOrLegacyLimit.summaryEnabled === true);
  const [summaryRow] = summaryEnabled
    ? await db
        .select({
          encrypted: conversations.summaryEncrypted,
          throughMessageId: conversations.summaryThroughMessageId,
        })
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1)
    : [];
  let recentMessageRows = historyLimit
    ? (
        await db
          .select({
            id: messages.id,
            role: messages.role,
            createdAt: messages.createdAt,
          })
          .from(messages)
          .where(eq(messages.conversationId, conversationId))
          .orderBy(desc(messages.createdAt))
          .limit(historyLimit)
      ).reverse()
    : await db
        .select({
          id: messages.id,
          role: messages.role,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(messages.createdAt);
  if (summaryRow?.throughMessageId) {
    const boundary = recentMessageRows.findIndex(
      (message) => message.id === summaryRow.throughMessageId,
    );
    if (boundary >= 0)
      recentMessageRows = recentMessageRows.slice(boundary + 1);
  }
  const attachmentMessageRows = historyLimit
    ? await db
        .select({
          id: messages.id,
          role: messages.role,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .innerJoin(messageParts, eq(messageParts.messageId, messages.id))
        .where(
          and(
            eq(messages.conversationId, conversationId),
            eq(messages.role, "user"),
            eq(messageParts.type, "file"),
          ),
        )
        .orderBy(messages.createdAt)
    : [];
  const messageRows = mergeHistoryWithAttachmentMessages(
    recentMessageRows,
    attachmentMessageRows,
  );

  const modelMessages: ModelMessage[] = [];
  if (summaryRow?.encrypted) {
    try {
      const summary = (await decryptValue(summaryRow.encrypted)).trim();
      if (summary)
        modelMessages.push({
          role: "system",
          content: `Conversation summary from earlier messages:\n${summary}`,
        });
    } catch (error) {
      logHandledWarning("Skipping undecryptable conversation summary", {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const modelMessageRows = messageRows.filter(
    (message) => message.role === "user" || message.role === "assistant",
  );
  if (modelMessageRows.length === 0) return modelMessages;

  const partsByMessageId = new Map<
    string,
    Array<{
      messageId: string;
      type: string;
      contentEncrypted: string | null;
      metadataJson: unknown;
      sortOrder: number;
    }>
  >();
  const partRows = await db
    .select({
      messageId: messageParts.messageId,
      type: messageParts.type,
      contentEncrypted: messageParts.contentEncrypted,
      metadataJson: messageParts.metadataJson,
      sortOrder: messageParts.sortOrder,
    })
    .from(messageParts)
    .where(
      inArray(
        messageParts.messageId,
        modelMessageRows.map((message) => message.id),
      ),
    )
    .orderBy(messageParts.messageId, messageParts.sortOrder);

  for (const part of partRows) {
    const existing = partsByMessageId.get(part.messageId);
    if (existing) {
      existing.push(part);
    } else {
      partsByMessageId.set(part.messageId, [part]);
    }
  }

  for (const message of modelMessageRows) {
    const textParts: string[] = [];
    const imageParts: Array<{
      type: "file";
      data: Uint8Array;
      mediaType: string;
      filename: string;
    }> = [];
    const artifactCodeBlocks = new Set<string>();
    for (const part of partsByMessageId.get(message.id) ?? []) {
      const metadata = await toolMetadataForModelHistory(part);
      const agentProgress = projectAgentProgressForModelHistory(metadata);
      if (agentProgress?.kind === "visual-only") continue;
      if (agentProgress?.kind === "delegation-result") {
        textParts.push(agentProgress.text);
        continue;
      }
      if (part.type === "file") {
        const imageAttachment = isChatImageAttachment(metadata)
          ? metadata
          : null;
        const fileAttachment = isChatFileAttachment(metadata) ? metadata : null;
        if (message.role === "user" && imageAttachment) {
          try {
            const attachment = await getChatImageAttachmentBytes({
              attachmentId: imageAttachment.id,
              workspaceId: context.workspaceId,
              userId: context.userId,
            });
            textParts.push(
              [
                `Attached image for visual analysis: ${attachment.metadata.fileName}`,
                `Attachment ID: ${imageAttachment.id}`,
                `MIME type: ${attachment.metadata.mimeType}`,
                `Sandbox path hint: ${sandboxAttachmentPathHint(imageAttachment.fileName)}`,
              ].join("\n"),
            );
            imageParts.push({
              type: "file",
              data: attachment.bytes,
              mediaType: attachment.metadata.mimeType,
              filename: attachment.metadata.fileName,
            });
          } catch (error) {
            logHandledWarning("Skipping unavailable chat image attachment", {
              messageId: message.id,
              attachmentId: imageAttachment.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        } else if (message.role === "user" && fileAttachment) {
          textParts.push(
            [
              `Attached file: ${fileAttachment.fileName} (${fileAttachment.mimeType}, ${fileAttachment.size} bytes).`,
              `Attachment ID: ${fileAttachment.id}`,
              `Sandbox path hint: ${sandboxAttachmentPathHint(fileAttachment.fileName)}`,
              fileAttachment.extractedTextChars > 0
                ? `Embedding-free document explorer: ${sandboxAttachmentExplorerPathHint(fileAttachment.fileName)}`
                : null,
              fileAttachment.extractedTextChars > 0
                ? `The stored Markdown extraction contains ${fileAttachment.extractedTextChars} characters. Pass this Attachment ID to run_code_sandbox, read the explorer manifest, then navigate with rg/sed/Python instead of asking for the whole document at once.`
                : (fileAttachment.extractionMessage ??
                  "No readable text was extracted."),
              fileAttachment.extractionStatus === "truncated"
                ? "The stored extraction is partial because safety limits were reached."
                : null,
            ]
              .filter(Boolean)
              .join("\n"),
          );
        }

        const codeWorkspaceContext =
          codeWorkspaceContextFromToolMetadata(metadata);
        if (codeWorkspaceContext) {
          textParts.push(
            `Uploaded code workspace available in chat:\n${codeWorkspaceContext}`,
          );
        }
      }

      if (part.type === "text" && part.contentEncrypted) {
        try {
          textParts.push(await decryptValue(part.contentEncrypted));
        } catch (error) {
          logHandledWarning("Skipping undecryptable message part", {
            messageId: message.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (message.role === "assistant") {
        const artifactCode = htmlArtifactCodeFromToolMetadata(metadata);
        if (artifactCode) artifactCodeBlocks.add(artifactCode);
        const codeWorkspaceContext =
          codeWorkspaceContextFromToolMetadata(metadata);
        if (codeWorkspaceContext) {
          artifactCodeBlocks.add(
            `Previously updated code workspace:\n${codeWorkspaceContext}`,
          );
        }
        const codeSandboxContext = codeSandboxContextFromToolMetadata(metadata);
        if (codeSandboxContext) {
          textParts.push(
            `Previously generated code sandbox output available for follow-up:\n${codeSandboxContext}`,
          );
        }
      }
    }

    for (const artifactCode of artifactCodeBlocks) {
      textParts.push(
        `Previously rendered HTML artifact code (available for follow-up edits or when the user asks for the code):\n${artifactCode}`,
      );
    }

    const content = textParts.join("\n").trim();
    if (message.role === "user" && imageParts.length > 0) {
      modelMessages.push({
        role: "user",
        content: [
          ...(content ? [{ type: "text" as const, text: content }] : []),
          ...imageParts,
        ],
      });
      continue;
    }
    if (content) {
      const role = message.role === "assistant" ? "assistant" : "user";
      modelMessages.push({ role, content });
    }
  }

  return modelMessages;
}
