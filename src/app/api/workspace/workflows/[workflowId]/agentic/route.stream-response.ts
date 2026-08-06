import type { Output, StreamTextResult, ToolSet } from "ai";
import type { Context } from "@ai-sdk/provider-utils";
import { z } from "zod";

import { logHandledWarning } from "@/lib/logger";
import type { ChatTodoList } from "@/modules/chat/todo-list";
import { workflowAgentToolLabels } from "@/modules/workflows/agentic";
import { appendWorkflowAgentMessage, type WorkflowAgentInputRequest } from "@/modules/workflows/agentic-history";
import { createWorkflowAgentRunRequest } from "@/modules/workflows/agentic-run-approvals";
import { updateWorkflow } from "@/modules/workflows/use-cases";

import { WorkflowAgenticState } from "./route.agentic-state";
import { encodeEvent, errorMessage } from "./route.params-schema";

export function createWorkflowAgentStream<TOOLS extends ToolSet, RUNTIME_CONTEXT extends Context, OUTPUT extends Output.Output>(input: {
  result: StreamTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>;
  state: WorkflowAgenticState;
  workflowId: string;
  workspaceId: string;
  userId: string;
  builderAgentName: string;
  initialWebResearchError: string | null;
}) {
  const { result, state, workflowId, workspaceId, userId } = input;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let streamedRevision = -1;
      let assistantText = "";
      let requestedInput = false;
      let requestedRun = false;
      try {
        controller.enqueue(encodeEvent({ type: "agent", name: input.builderAgentName }));
        controller.enqueue(encodeEvent({ type: "tool_start", id: "automatic-web-research", toolName: "web_search", label: workflowAgentToolLabels.web_search }));
        controller.enqueue(encodeEvent({ type: "tool_result", id: "automatic-web-research", toolName: "web_search", label: workflowAgentToolLabels.web_search, status: input.initialWebResearchError ? "error" : "done" }));
        for await (const part of result.stream) {
          if (part.type === "text-delta") {
            assistantText += part.text;
            controller.enqueue(encodeEvent({ type: "text", delta: part.text }));
          } else if (part.type === "tool-call") {
            controller.enqueue(encodeEvent({ type: "tool_start", id: part.toolCallId, toolName: part.toolName, label: workflowAgentToolLabels[part.toolName] ?? part.toolName }));
          } else if (part.type === "tool-result") {
            controller.enqueue(encodeEvent({ type: "tool_result", id: part.toolCallId, toolName: part.toolName, label: workflowAgentToolLabels[part.toolName] ?? part.toolName }));
            if (part.toolName === "request_user_input" && typeof part.output === "object" && part.output !== null) {
              requestedInput = true;
              controller.enqueue(encodeEvent({ type: "input_request", request: part.output as WorkflowAgentInputRequest }));
            }
            if (part.toolName === "request_workflow_run") requestedRun = true;
            if (part.toolName === "update_todo_list" && typeof part.output === "object" && part.output !== null) controller.enqueue(encodeEvent({ type: "todo_list", todoList: part.output as ChatTodoList }));
            if (state.revision > 0 && state.revision !== streamedRevision) {
              streamedRevision = state.revision;
              controller.enqueue(encodeEvent({ type: "workflow", draft: state.draft }));
            }
          } else if (part.type === "tool-error") {
            logHandledWarning("Workflow builder tool failed", { workflowId, workspaceId, toolName: part.toolName, revision: state.revision, error: part.error instanceof Error ? part.error.message : String(part.error) });
            controller.enqueue(encodeEvent({ type: "tool_result", id: part.toolCallId, toolName: part.toolName, label: workflowAgentToolLabels[part.toolName] ?? part.toolName, status: "error" }));
          } else if (part.type === "error") throw part.error instanceof Error ? part.error : new Error(String(part.error));
        }

        if (state.revision > 0) {
          state.draft = { ...state.draft, name: z.string().trim().min(1).max(255).parse(state.draft.name), definition: state.validateDefinition(state.draft.definition) };
          const saved = await updateWorkflow({ workflowId, workspaceId, userId, name: state.draft.name, description: state.draft.description, definition: state.draft.definition });
          controller.enqueue(encodeEvent({ type: "saved", workflow: saved }));
        }
        if (state.pendingRunRequest) {
          const request = await createWorkflowAgentRunRequest({ workflowId, workspaceId, userId, ...state.pendingRunRequest });
          controller.enqueue(encodeEvent({ type: "run_request", request }));
        }
        if (!assistantText.trim()) {
          const fallback = requestedInput ? "J’ai besoin des informations demandées pour continuer." : requestedRun ? "Le workflow est testé. J’attends votre validation avant de lancer l’exécution." : state.revision > 0 ? "Le workflow a été mis à jour." : "La demande a été analysée.";
          assistantText = fallback;
          controller.enqueue(encodeEvent({ type: "text", delta: fallback }));
        }
        await appendWorkflowAgentMessage({ workflowId, workspaceId, userId, role: "assistant", content: assistantText });
        controller.enqueue(encodeEvent({ type: "done" }));
      } catch (error) {
        logHandledWarning("Workflow builder stream stopped", { workflowId, workspaceId, revision: state.revision, actionCount: state.actionCount, error: error instanceof Error ? error.message : String(error) });
        controller.enqueue(encodeEvent({ type: "error", message: errorMessage(error) }));
      } finally {
        controller.close();
      }
    },
    cancel() {},
  });
}
