import { projectToolMessagePayload } from "@/modules/tool/safe-payload";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import {
  metadataFromHeaders,
  outputIsDenied,
  stringValue,
  subscribeToChatStream,
} from "./stream-bus.ai-hub-chat-uimessage-metadata";
/**
 * AI SDK UI-compatible view of the existing Maiah stream bus. This lets the
 * current chat runtime keep its audited custom events while clients can consume
 * the standard UIMessage stream protocol through DefaultChatTransport/useChat.
 */
export function createChatUIMessageStreamResponse(
  messageId: string,
  headers: Record<string, string> = {},
  options: { replay?: boolean } = {},
) {
  const stream = createUIMessageStream({
    execute: ({ writer }) =>
      new Promise<void>((resolve) => {
        const metadata = metadataFromHeaders(headers);
        let textPartId: string | null = null;
        let reasoningPartId: string | null = null;
        let partSequence = 0;
        let settled = false;
        function nextPartId(prefix: string) {
          partSequence += 1;
          return `${prefix}-${partSequence}`;
        }
        function finishTextPart() {
          if (textPartId) {
            writer.write({ type: "text-end", id: textPartId });
            textPartId = null;
          }
        }
        function finishReasoningPart() {
          if (reasoningPartId) {
            writer.write({ type: "reasoning-end", id: reasoningPartId });
            reasoningPartId = null;
          }
        }
        function finishOpenParts() {
          finishTextPart();
          finishReasoningPart();
        }
        function settle(stopped = false) {
          if (settled) return;
          settled = true;
          finishOpenParts();
          writer.write({
            type: "finish",
            finishReason: stopped ? "stop" : "stop",
            messageMetadata: { ...metadata, stopped },
          });
          resolve();
        }
        writer.write({
          type: "start",
          messageId,
          messageMetadata: metadata,
        });
        let unsubscribe: () => void = () => undefined;
        unsubscribe = subscribeToChatStream(
          messageId,
          {
            enqueue(event) {
              const type = stringValue(event.type);
              if (type === "text") {
                const delta = stringValue(event.delta);
                if (!delta) return;
                finishReasoningPart();
                if (!textPartId) {
                  textPartId = nextPartId("text");
                  writer.write({ type: "text-start", id: textPartId });
                }
                writer.write({ type: "text-delta", id: textPartId, delta });
                return;
              }
              if (type === "reasoning_start") {
                finishTextPart();
                if (!reasoningPartId) {
                  reasoningPartId = nextPartId("reasoning");
                  writer.write({
                    type: "reasoning-start",
                    id: reasoningPartId,
                  });
                }
                return;
              }
              if (type === "reasoning") {
                const delta = stringValue(event.delta);
                if (!delta) return;
                finishTextPart();
                if (!reasoningPartId) {
                  reasoningPartId = nextPartId("reasoning");
                  writer.write({
                    type: "reasoning-start",
                    id: reasoningPartId,
                  });
                }
                writer.write({
                  type: "reasoning-delta",
                  id: reasoningPartId,
                  delta,
                });
                return;
              }
              if (type === "reasoning_end") {
                finishReasoningPart();
                return;
              }
              if (type !== "conversation_title") {
                finishOpenParts();
              }
              if (type === "tool_input_start") {
                const toolCallId = stringValue(event.toolCallId);
                const toolName = stringValue(event.toolName);
                if (toolCallId && toolName) {
                  writer.write({
                    type: "tool-input-start",
                    toolCallId,
                    toolName,
                  });
                }
                return;
              }
              if (type === "tool_input_delta") {
                const toolCallId = stringValue(event.toolCallId);
                const inputTextDelta = stringValue(event.delta);
                if (toolCallId && inputTextDelta) {
                  writer.write({
                    type: "tool-input-delta",
                    toolCallId,
                    inputTextDelta,
                  });
                }
                return;
              }
              if (type === "tool_input_snapshot") {
                const toolCallId = stringValue(event.toolCallId);
                const toolName = stringValue(event.toolName);
                const inputText = stringValue(event.inputText);
                if (toolCallId && toolName && inputText) {
                  writer.write({
                    type: "data-tool-input-progress",
                    id: `${toolCallId}:input-progress`,
                    data: { toolCallId, toolName, inputText },
                  });
                }
                return;
              }
              if (type === "tool_call") {
                const toolCallId = stringValue(event.toolCallId);
                const toolName = stringValue(event.toolName);
                if (toolCallId && toolName) {
                  if (event.agentContext) {
                    writer.write({
                      type: "data-agent-tool-context",
                      id: `${toolCallId}:context`,
                      data: {
                        toolCallId,
                        agentContext: event.agentContext,
                      },
                    });
                  }
                  writer.write({
                    type: "tool-input-available",
                    toolCallId,
                    toolName,
                    input: projectToolMessagePayload(event.input),
                  });
                }
                return;
              }
              if (type === "tool_result") {
                const toolCallId = stringValue(event.toolCallId);
                if (!toolCallId) return;
                if (event.agentContext) {
                  writer.write({
                    type: "data-agent-tool-context",
                    id: `${toolCallId}:context`,
                    data: {
                      toolCallId,
                      agentContext: event.agentContext,
                    },
                  });
                }
                if (outputIsDenied(event.output)) {
                  writer.write({ type: "tool-output-denied", toolCallId });
                } else {
                  writer.write({
                    type: "tool-output-available",
                    toolCallId,
                    output: projectToolMessagePayload(event.output),
                  });
                }
                return;
              }
              if (type === "tool_approval_required") {
                const invocationId = stringValue(event.invocationId);
                if (invocationId) {
                  writer.write({
                    type: "data-tool-approval",
                    id: invocationId,
                    data: {
                      invocationId,
                      toolName: event.toolName,
                      input: projectToolMessagePayload(event.input),
                    },
                  });
                }
                return;
              }
              if (type === "citations" && Array.isArray(event.citations)) {
                writer.write({
                  type: "data-citations",
                  id: "citations",
                  data: event.citations,
                });
                for (const citation of event.citations) {
                  if (
                    typeof citation === "object" &&
                    citation !== null &&
                    typeof (citation as { chunkId?: unknown }).chunkId ===
                      "string"
                  ) {
                    writer.write({
                      type: "source-document",
                      sourceId: (citation as { chunkId: string }).chunkId,
                      mediaType: "text/plain",
                      title:
                        stringValue(
                          (citation as { documentTitle?: unknown })
                            .documentTitle,
                        ) ?? "Knowledge source",
                    });
                  }
                }
                return;
              }
              if (type === "impact" && event.impact) {
                writer.write({
                  type: "data-impact",
                  id: "impact",
                  data: event.impact,
                });
                return;
              }
              if (type === "file") {
                writer.write({
                  type: "data-code-workspace-artifact",
                  id: stringValue(
                    (event.artifact as { projectId?: unknown })?.projectId,
                  ),
                  data: event.artifact,
                });
                return;
              }
              if (type === "suggestions") {
                writer.write({
                  type: "data-suggestions",
                  id: "suggestions",
                  data: event.suggestions,
                });
                return;
              }
              if (type === "conversation_title") {
                writer.write({
                  type: "data-conversation-title",
                  id: "conversation-title",
                  data: { title: event.title },
                  transient: true,
                });
                return;
              }
              if (type === "error") {
                writer.write({
                  type: "error",
                  errorText: stringValue(event.error) ?? "Chat stream failed",
                });
                settle(false);
                unsubscribe();
                return;
              }
              if (type === "done") {
                settle(event.stopped === true);
                unsubscribe();
              }
            },
            close() {
              settle(false);
            },
          },
          options,
        );
      }),
    onError: (error) =>
      error instanceof Error ? error.message : "Chat stream failed",
  });
  return createUIMessageStreamResponse({
    stream,
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      ...headers,
    },
  });
}
