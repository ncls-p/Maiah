import { DefaultChatTransport, type UIMessage } from "ai";

import {
  StreamAiSdkUIChatOptions,
  agentToolContextFromData,
  isCitationArray,
  isCodeWorkspaceArtifact,
  iterateChunks,
  readMetadata,
  titleFromData,
  toolApprovalFromData,
  toolInputProgressFromData,
} from "./ai-sdk-ui-chat-transport.ai-sdk-uichat-start-metadata";

export async function streamAiSdkUIChat(options: StreamAiSdkUIChatOptions) {
  const toolNamesByCallId = new Map<string, string>();
  const agentContextsByCallId = new Map<string, unknown>();
  const transport = new DefaultChatTransport<UIMessage>({
    api: options.api,
    credentials: "same-origin",
    headers: { "X-AI-Hub-Stream-Protocol": "ai-sdk-ui" },
    prepareSendMessagesRequest: ({ body }) => ({
      body: body ?? {},
      headers: { "X-AI-Hub-Stream-Protocol": "ai-sdk-ui" },
      credentials: "same-origin",
    }),
  });

  const stream = await transport.sendMessages({
    trigger: options.resendFromMessageId
      ? "regenerate-message"
      : "submit-message",
    chatId: options.chatId,
    messageId: options.resendFromMessageId,
    messages: [
      {
        id: options.localUserMessageId,
        role: "user",
        parts: [{ type: "text", text: options.content }],
      },
    ],
    abortSignal: options.abortSignal,
    body: options.body,
  });

  const _isString = (item: unknown) => typeof item === "string";

  for await (const chunk of iterateChunks(stream)) {
    switch (chunk.type) {
      case "start":
        options.onStart({
          ...readMetadata(chunk.messageMetadata),
          messageId:
            chunk.messageId ?? readMetadata(chunk.messageMetadata).messageId,
        });
        break;
      case "text-delta":
        options.onEvent({ type: "text", delta: chunk.delta });
        break;
      case "reasoning-start":
        options.onEvent({ type: "reasoning_start" });
        break;
      case "reasoning-delta":
        options.onEvent({ type: "reasoning", delta: chunk.delta });
        break;
      case "reasoning-end":
        options.onEvent({ type: "reasoning_end" });
        break;
      case "tool-input-start":
        toolNamesByCallId.set(chunk.toolCallId, chunk.toolName);
        options.onEvent({
          type: "tool_input_start",
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
        });
        break;
      case "tool-input-delta":
        options.onEvent({
          type: "tool_input_delta",
          toolCallId: chunk.toolCallId,
          delta: chunk.inputTextDelta,
        });
        break;
      case "tool-input-available":
        toolNamesByCallId.set(chunk.toolCallId, chunk.toolName);
        options.onEvent({
          type: "tool_call",
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          input: chunk.input,
          agentContext: agentContextsByCallId.get(chunk.toolCallId),
        });
        break;
      case "tool-output-available":
        options.onEvent({
          type: "tool_result",
          toolCallId: chunk.toolCallId,
          toolName: toolNamesByCallId.get(chunk.toolCallId) ?? "tool",
          output: chunk.output,
          agentContext: agentContextsByCallId.get(chunk.toolCallId),
        });
        agentContextsByCallId.delete(chunk.toolCallId);
        break;
      case "tool-output-denied":
        options.onEvent({
          type: "tool_result",
          toolCallId: chunk.toolCallId,
          toolName: toolNamesByCallId.get(chunk.toolCallId) ?? "tool",
          output: { denied: true },
          agentContext: agentContextsByCallId.get(chunk.toolCallId),
        });
        agentContextsByCallId.delete(chunk.toolCallId);
        break;
      case "tool-output-error":
        options.onEvent({
          type: "tool_result",
          toolCallId: chunk.toolCallId,
          toolName: toolNamesByCallId.get(chunk.toolCallId) ?? "tool",
          output: { denied: true, message: chunk.errorText },
          agentContext: agentContextsByCallId.get(chunk.toolCallId),
        });
        agentContextsByCallId.delete(chunk.toolCallId);
        break;
      case "data-agent-tool-context": {
        const context = agentToolContextFromData(chunk.data);
        if (context) {
          agentContextsByCallId.set(context.toolCallId, context.agentContext);
        }
        break;
      }
      case "data-tool-input-progress": {
        const event = toolInputProgressFromData(chunk.data);
        if (event) options.onEvent(event);
        break;
      }
      case "data-tool-approval": {
        const event = toolApprovalFromData(chunk.data);
        if (event) options.onEvent(event);
        break;
      }
      case "data-citations":
        if (isCitationArray(chunk.data)) {
          options.onEvent({ type: "citations", citations: chunk.data });
        }
        break;
      case "data-code-workspace-artifact":
        if (isCodeWorkspaceArtifact(chunk.data)) {
          options.onEvent({ type: "file", artifact: chunk.data });
        }
        break;
      case "data-suggestions":
        if (Array.isArray(chunk.data) && chunk.data.every(_isString)) {
          options.onEvent({ type: "suggestions", suggestions: chunk.data });
        }
        break;
      case "data-impact":
        if (typeof chunk.data === "object" && chunk.data !== null) {
          options.onEvent({
            type: "impact",
            impact:
              chunk.data as import("@/components/chat/chat-types").ChatUsageImpact,
          });
        }
        break;
      case "data-conversation-title": {
        const title = titleFromData(chunk.data);
        if (title) options.onEvent({ type: "conversation_title", title });
        break;
      }
      case "error":
        options.onEvent({ type: "error", error: chunk.errorText });
        break;
      case "finish":
        options.onEvent({ type: "done" });
        break;
    }
  }
}
