import type { Edge, ReactFlowInstance } from "@xyflow/react";
import { useTranslations } from "next-intl";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { fetchJson } from "@/lib/api-client";
import type { ChatTodoList } from "@/modules/chat/todo-list";
import type {
  WorkflowAgenticHistoryMessage,
  WorkflowAgenticStreamEvent,
} from "@/modules/workflows/agentic";
import type { WorkflowAgentInputRequest } from "@/modules/workflows/agentic-history";
import type { WorkflowAgentRunRequest } from "@/modules/workflows/agentic-run-approvals";
import type { WorkflowDefinition } from "@/modules/workflows/contracts";
import type { WorkflowDetail } from "./types";
import type { WorkflowAgenticActivity } from "./workflow-agentic-panel";
import {
  canvasEdges,
  canvasNodes,
  workflowDefinition,
} from "./workflow-builder.node-types";
import type { WorkflowCanvasNodeType } from "./workflow-canvas-node";
export function useWorkflowAgenticEditor(input: {
  workspaceId: string;
  workflow: WorkflowDetail;
  setWorkflow: Dispatch<SetStateAction<WorkflowDetail>>;
  nodes: WorkflowCanvasNodeType[];
  edges: Edge[];
  setNodes: Dispatch<SetStateAction<WorkflowCanvasNodeType[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setSelectedNodeId: Dispatch<SetStateAction<string | null>>;
  flow: ReactFlowInstance<WorkflowCanvasNodeType> | null;
  loadRuns: () => Promise<void>;
  loadRunDetail: (runId: string) => Promise<void>;
}) {
  const {
    workspaceId,
    workflow,
    setWorkflow,
    nodes,
    edges,
    setNodes,
    setEdges,
    setSelectedNodeId,
    flow,
    loadRuns,
    loadRunDetail,
  } = input;
  const t = useTranslations("workflows");
  const [agenticMessages, setAgenticMessages] = useState<
    WorkflowAgenticHistoryMessage[]
  >([]);
  const [agenticPendingRequests, setAgenticPendingRequests] = useState<
    WorkflowAgentInputRequest[]
  >([]);
  const [agenticRunRequests, setAgenticRunRequests] = useState<
    WorkflowAgentRunRequest[]
  >([]);
  const [agenticTodoList, setAgenticTodoList] = useState<ChatTodoList | null>(
    null,
  );
  const [agenticHistoryLoading, setAgenticHistoryLoading] = useState(true);
  const [submittingAgenticRequestId, setSubmittingAgenticRequestId] = useState<
    string | null
  >(null);
  const [decidingAgenticRunRequestId, setDecidingAgenticRunRequestId] =
    useState<string | null>(null);
  const [agenticActivities, setAgenticActivities] = useState<
    WorkflowAgenticActivity[]
  >([]);
  const [agenticInput, setAgenticInput] = useState("");
  const [agenticRunning, setAgenticRunning] = useState(false);
  const [agenticAgentName, setAgenticAgentName] = useState<string | null>(null);
  const agenticAbortRef = useRef<AbortController | null>(null);
  const loadAgenticHistory = useCallback(async () => {
    setAgenticHistoryLoading(true);
    try {
      const payload = await fetchJson<{
        messages: WorkflowAgenticHistoryMessage[];
        pendingRequests: WorkflowAgentInputRequest[];
        runRequests?: WorkflowAgentRunRequest[];
        todoList?: ChatTodoList | null;
      }>(
        `/api/workspace/workflows/${workflow.id}/agentic?workspaceId=${workspaceId}`,
      );
      setAgenticMessages((current) => {
        const persistedIds = new Set(
          payload.messages.map((message) => message.id),
        );
        return [
          ...payload.messages,
          ...current.filter((message) => !persistedIds.has(message.id)),
        ];
      });
      setAgenticPendingRequests((current) => {
        const persistedIds = new Set(
          payload.pendingRequests.map((request) => request.id),
        );
        return [
          ...payload.pendingRequests,
          ...current.filter((request) => !persistedIds.has(request.id)),
        ];
      });
      setAgenticRunRequests((current) => {
        const requests = payload.runRequests ?? [];
        const persistedIds = new Set(requests.map((request) => request.id));
        return [
          ...requests,
          ...current.filter((request) => !persistedIds.has(request.id)),
        ];
      });
      setAgenticTodoList(payload.todoList ?? null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("agentic.historyLoadFailed"),
      );
    } finally {
      setAgenticHistoryLoading(false);
    }
  }, [t, workflow.id, workspaceId]);
  useEffect(() => {
    const timeout = window.setTimeout(() => void loadAgenticHistory(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadAgenticHistory]);
  useEffect(
    () => () => {
      agenticAbortRef.current?.abort();
    },
    [],
  );
  function applyAgenticDraft(draft: {
    name: string;
    description: string | null;
    definition: WorkflowDefinition;
  }) {
    setWorkflow((current) => ({
      ...current,
      name: draft.name,
      description: draft.description,
      definition: draft.definition,
    }));
    setNodes(canvasNodes(draft.definition));
    setEdges(canvasEdges(draft.definition));
    setSelectedNodeId(null);
    window.setTimeout(
      () => void flow?.fitView({ padding: 0.24, duration: 350 }),
      0,
    );
  }

  function updateLastAgenticMessage(delta: string) {
    setAgenticMessages((current) => {
      const last = current.at(-1);
      if (last?.role !== "assistant") return current;
      return [
        ...current.slice(0, -1),
        { ...last, content: `${last.content}${delta}` },
      ];
    });
  }

  function handleAgenticEvent(event: WorkflowAgenticStreamEvent) {
    if (event.type === "agent") {
      setAgenticAgentName(event.name);
      return;
    }
    if (event.type === "tool_start") {
      setAgenticActivities((current) => [
        ...current.filter((item) => item.id !== event.id),
        {
          id: event.id,
          toolName: event.toolName,
          status: "running",
        },
      ]);
      return;
    }
    if (event.type === "tool_result") {
      setAgenticActivities((current) =>
        current.map((item) =>
          item.id === event.id
            ? { ...item, status: event.status ?? "done" }
            : item,
        ),
      );
      return;
    }
    if (event.type === "workflow") {
      applyAgenticDraft(event.draft);
      return;
    }
    if (event.type === "text") {
      updateLastAgenticMessage(event.delta);
      return;
    }
    if (event.type === "input_request") {
      setAgenticPendingRequests((current) => [
        ...current.filter((request) => request.id !== event.request.id),
        event.request,
      ]);
      return;
    }
    if (event.type === "run_request") {
      setAgenticRunRequests((current) => [
        ...current.filter((request) => request.id !== event.request.id),
        event.request,
      ]);
      return;
    }
    if (event.type === "todo_list") {
      setAgenticTodoList(event.todoList);
      return;
    }
    if (event.type === "saved") {
      const saved = event.workflow as WorkflowDetail;
      setWorkflow(saved);
      setNodes(canvasNodes(saved.definition));
      setEdges(canvasEdges(saved.definition));
      return;
    }
    if (event.type === "error") throw new Error(event.message);
  }

  async function runAgenticBuilder(
    suggestedPrompt?: string,
    inputRequestId?: string,
  ) {
    const prompt = (suggestedPrompt ?? agenticInput).trim();
    if (!prompt || agenticRunning) return;

    const userMessage: WorkflowAgenticHistoryMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
      createdAt: new Date().toISOString(),
    };
    const assistantMessage: WorkflowAgenticHistoryMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
    };
    setAgenticMessages((current) => [
      ...current,
      userMessage,
      assistantMessage,
    ]);
    setAgenticActivities([]);
    setAgenticInput("");
    setAgenticRunning(true);
    const abortController = new AbortController();
    agenticAbortRef.current = abortController;

    try {
      const response = await fetch(
        `/api/workspace/workflows/${workflow.id}/agentic`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            ...(inputRequestId ? { inputRequestId } : { message: prompt }),
            draft: {
              name: workflow.name,
              description: workflow.description,
              definition: workflowDefinition(
                nodes,
                edges,
                workflow.definition.defaultInput,
              ),
            },
          }),
          signal: abortController.signal,
        },
      );
      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? t("agentic.failed"));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          handleAgenticEvent(JSON.parse(line) as WorkflowAgenticStreamEvent);
        }
        if (done) break;
      }
      if (buffer.trim()) {
        handleAgenticEvent(JSON.parse(buffer) as WorkflowAgenticStreamEvent);
      }
      setAgenticMessages((current) => {
        const last = current.at(-1);
        if (last?.role !== "assistant" || last.content.trim()) return current;
        return [
          ...current.slice(0, -1),
          { ...last, content: t("agentic.completed") },
        ];
      });
    } catch (error) {
      setAgenticActivities((current) =>
        current.map((item) =>
          item.status === "running" ? { ...item, status: "error" } : item,
        ),
      );
      if (abortController.signal.aborted) {
        setAgenticMessages((current) => {
          const last = current.at(-1);
          if (last?.role !== "assistant") return current;
          return [
            ...current.slice(0, -1),
            { ...last, content: last.content || t("agentic.stopped") },
          ];
        });
      } else {
        const message =
          error instanceof Error ? error.message : t("agentic.failed");
        toast.error(message);
        setAgenticMessages((current) => {
          const last = current.at(-1);
          if (last?.role !== "assistant") return current;
          return [
            ...current.slice(0, -1),
            { ...last, content: last.content || t("agentic.failed") },
          ];
        });
      }
    } finally {
      if (agenticAbortRef.current === abortController) {
        agenticAbortRef.current = null;
      }
      setAgenticRunning(false);
    }
  }

  async function submitAgenticRequest(
    request: WorkflowAgentInputRequest,
    values: Record<string, string>,
  ) {
    if (agenticRunning || submittingAgenticRequestId) return;
    setSubmittingAgenticRequestId(request.id);
    try {
      const payload = await fetchJson<{
        id: string;
        displayMessage: string;
      }>(
        `/api/workspace/workflows/${workflow.id}/agentic/inputs/${request.id}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId, values }),
        },
      );
      setAgenticPendingRequests((current) =>
        current.filter((item) => item.id !== request.id),
      );
      await runAgenticBuilder(payload.displayMessage, request.id);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("agentic.informationSubmitFailed"),
      );
    } finally {
      setSubmittingAgenticRequestId(null);
    }
  }

  async function decideAgenticRunRequest(
    request: WorkflowAgentRunRequest,
    decision: "approve" | "reject",
  ) {
    if (agenticRunning || decidingAgenticRunRequestId) return;
    setDecidingAgenticRunRequestId(request.id);
    try {
      const result = await fetchJson<{
        requestId: string;
        status: "approved" | "rejected";
        runId?: string;
      }>(`/api/workspace/workflows/${workflow.id}/agentic/runs/${request.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, decision }),
      });
      setAgenticRunRequests((current) =>
        current.filter((item) => item.id !== request.id),
      );
      if (decision === "approve") {
        toast.success(t("agentic.runApproved"));
        await loadRuns();
        if (result.runId) await loadRunDetail(result.runId);
      } else {
        toast.success(t("agentic.runRejected"));
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("agentic.runDecisionFailed"),
      );
    } finally {
      setDecidingAgenticRunRequestId(null);
    }
  }
  return {
    agenticMessages,
    agenticPendingRequests,
    agenticRunRequests,
    agenticTodoList,
    agenticHistoryLoading,
    submittingAgenticRequestId,
    decidingAgenticRunRequestId,
    agenticActivities,
    agenticInput,
    setAgenticInput,
    agenticRunning,
    agenticAgentName,
    agenticAbortRef,
    runAgenticBuilder,
    submitAgenticRequest,
    decideAgenticRunRequest,
  };
}
