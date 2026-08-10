import { encryptValue } from "@/lib/crypto";
import { logHandledWarning } from "@/lib/logger";
import type { AgentToolProgressEvent } from "@/modules/agent/runtime-executor";
import type { AgentToolDisplayContext } from "@/modules/agent/tool-progress-payload";
import { projectToolMessagePayload } from "@/modules/tool/safe-payload";
import { db } from "@/server/infrastructure/db";
import { messageParts } from "@/server/infrastructure/db/schema";

import { knowledgeCitationsFromToolOutput } from "./route-support";

export function projectOrchestrationProgress(progress: AgentToolProgressEvent) {
  const isStart = progress.type === "tool-start";
  const status = isStart
    ? "running"
    : "error" in progress
      ? "error"
      : "success";
  const value = isStart
    ? progress.input
    : "error" in progress
      ? {
          error: progress.error,
          ...(progress.errorCode ? { errorCode: progress.errorCode } : {}),
        }
      : progress.output;
  const agentContext = {
    agentId: progress.agentId,
    agentName: progress.agentName,
    runId: progress.runId,
    parentRunId: progress.parentRunId ?? undefined,
    depth: progress.depth,
    status,
    ...(!isStart ? { durationMs: progress.durationMs } : {}),
  } satisfies AgentToolDisplayContext;
  const modelHistoryMetadata = progress.modelHistoryKind
    ? { modelHistoryKind: progress.modelHistoryKind }
    : {};
  const rawMetadata = isStart
    ? {
        toolCallId: progress.id,
        toolName: progress.toolName,
        input: value,
        agentContext,
        ...modelHistoryMetadata,
      }
    : {
        toolCallId: progress.id,
        toolName: progress.toolName,
        output: value,
        agentContext,
        ...modelHistoryMetadata,
      };
  const safeValue = projectToolMessagePayload(value);
  const safeMetadata = isStart
    ? {
        toolCallId: progress.id,
        toolName: progress.toolName,
        input: safeValue,
        agentContext,
        ...modelHistoryMetadata,
      }
    : {
        toolCallId: progress.id,
        toolName: progress.toolName,
        output: safeValue,
        agentContext,
        ...modelHistoryMetadata,
      };
  return { isStart, agentContext, rawMetadata, safeMetadata, safeValue };
}

export function createOrchestrationProgress(input: {
  requestId: string;
  agentId: string;
  assistantMessageId: string;
  enqueueEvent: (event: Record<string, unknown>) => void;
  initialSortOrder: number;
}) {
  let nextSortOrder = input.initialSortOrder;
  let progressQueue = Promise.resolve();
  const durableDelegationProgress: Array<{
    progress: AgentToolProgressEvent;
    sortOrder: number;
  }> = [];
  const allocateSortOrder = () => nextSortOrder++;
  const persist = async (
    progress: AgentToolProgressEvent,
    sortOrder: number,
    citationSortOrder?: number,
  ) => {
    const projected = projectOrchestrationProgress(progress);
    try {
      if (progress.modelHistoryKind !== "delegation-result") {
        await db.insert(messageParts).values({
          messageId: input.assistantMessageId,
          type: projected.isStart ? "tool-call" : "tool-result",
          contentEncrypted: await encryptValue(
            JSON.stringify(projected.rawMetadata),
          ),
          metadataJson: projected.safeMetadata,
          sortOrder,
        });
      }
      const citations =
        progress.type === "tool-end" && "output" in progress
          ? knowledgeCitationsFromToolOutput(progress.output)
          : [];
      if (citations.length > 0 && citationSortOrder !== undefined) {
        await db.insert(messageParts).values({
          messageId: input.assistantMessageId,
          type: "citations",
          contentEncrypted: await encryptValue(JSON.stringify(citations)),
          metadataJson: null,
          sortOrder: citationSortOrder,
        });
        input.enqueueEvent({ type: "citations", citations });
      }
      input.enqueueEvent(
        projected.isStart
          ? {
              type: "tool_call",
              toolCallId: progress.id,
              toolName: progress.toolName,
              input: projected.safeValue,
              agentContext: projected.agentContext,
            }
          : {
              type: "tool_result",
              toolCallId: progress.id,
              toolName: progress.toolName,
              output: projected.safeValue,
              agentContext: projected.agentContext,
            },
      );
    } catch (error) {
      logHandledWarning("Failed to persist orchestrator progress", {
        requestId: input.requestId,
        agentId: input.agentId,
        runId: progress.runId,
        toolName: progress.toolName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  const queue = (progress: AgentToolProgressEvent) => {
    const sortOrder = allocateSortOrder();
    const citationSortOrder =
      progress.type === "tool-end" &&
      "output" in progress &&
      knowledgeCitationsFromToolOutput(progress.output).length > 0
        ? allocateSortOrder()
        : undefined;
    if (progress.modelHistoryKind === "delegation-result")
      durableDelegationProgress.push({ progress, sortOrder });
    progressQueue = progressQueue
      .then(() => persist(progress, sortOrder, citationSortOrder))
      .catch((error) =>
        logHandledWarning("Orchestrator progress queue failed", {
          requestId: input.requestId,
          agentId: input.agentId,
          runId: progress.runId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
  };
  const flush = async () => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const flushed = await Promise.race([
      progressQueue.then(() => true),
      new Promise<false>((resolve) => {
        timeout = setTimeout(() => resolve(false), 2_000);
      }),
    ]);
    if (timeout) clearTimeout(timeout);
    if (!flushed)
      logHandledWarning("Orchestrator progress flush timed out", {
        requestId: input.requestId,
        agentId: input.agentId,
        assistantMessageId: input.assistantMessageId,
      });
  };
  return {
    allocateSortOrder,
    durableDelegationProgress,
    flush,
    queue,
    get nextSortOrder() {
      return nextSortOrder;
    },
  };
}
