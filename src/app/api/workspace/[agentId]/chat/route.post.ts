import { logger, logHandledError } from "@/lib/logger";
import { db } from "@/server/infrastructure/db";
import { messages } from "@/server/infrastructure/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { validateChatRequest } from "./route.post.part-a";
import { executePreparedChatRequest } from "./route.post.part-b";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const requestStartedAt = Date.now();
  const jsonResponse = (body: unknown, status: number) =>
    NextResponse.json(body, { status, headers: { "x-request-id": requestId } });
  const rejectChatRequest = (
    status: number,
    reason: string,
    body: unknown,
    context: Record<string, unknown> = {},
  ) => {
    logger.warn("Chat request rejected", {
      requestId,
      status,
      reason,
      durationMs: Date.now() - requestStartedAt,
      ...context,
    });
    return jsonResponse(body, status);
  };
  let userMessageId: string | undefined;
  let assistantMessageId: string | undefined;
  let assistantStreamGenerationId: string | undefined;
  let createdUserMessage = false;

  try {
    const { agentId } = await params;
    const validated = await validateChatRequest({
      req,
      agentId,
      requestId,
      requestStartedAt,
      rejectChatRequest,
    });
    if (validated instanceof Response) return validated;
    const execution = await executePreparedChatRequest({
      agentId,
      requestId,
      requestStartedAt,
      ...validated,
    });
    userMessageId = execution.userMessageId;
    assistantMessageId = execution.assistantMessageId;
    assistantStreamGenerationId = execution.assistantStreamGenerationId;
    createdUserMessage = execution.createdUserMessage;
    return execution.response;
  } catch (error) {
    // Chat request failed — messages marked failed below

    if (assistantMessageId) {
      await db
        .update(messages)
        .set({
          status: "failed",
          completedAt: new Date(),
          streamLeaseExpiresAt: null,
        })
        .where(
          and(
            eq(messages.id, assistantMessageId),
            inArray(messages.status, ["pending", "streaming"]),
            assistantStreamGenerationId
              ? eq(messages.streamGenerationId, assistantStreamGenerationId)
              : undefined,
          ),
        );
    }
    if (userMessageId && createdUserMessage) {
      await db
        .update(messages)
        .set({ status: "failed", completedAt: new Date() })
        .where(eq(messages.id, userMessageId));
    }

    logHandledError(
      "Chat request failed",
      {
        requestId,
        status: 500,
        userMessageId,
        assistantMessageId,
        durationMs: Date.now() - requestStartedAt,
      },
      error as Error,
    );

    return jsonResponse(
      {
        error: "Internal server error",
        ...(process.env.NODE_ENV !== "production" && error instanceof Error
          ? { detail: error.message }
          : {}),
      },
      500,
    );
  }
}
