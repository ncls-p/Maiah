"use client";

import { addEdge,MarkerType,useEdgesState,useNodesState,type Connection,type ReactFlowInstance } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { useCallback,useEffect,useMemo,useRef,useState } from "react";
import { toast } from "sonner";

import { fetchJson } from "@/lib/api-client";
import { WORKFLOW_NODE_CATALOG,workflowNodeCatalogItem,type WorkflowNodeCategory } from "@/modules/workflows/catalog";
import type { WorkflowNodeType } from "@/modules/workflows/contracts";

import type { WorkflowDetail,WorkflowRun,WorkflowRunDetail } from "./types";
import { AgentOption,canvasEdges,canvasNodes,workflowDefinition } from "./workflow-builder.node-types";
import { useWorkflowAgenticEditor } from "./workflow-builder.use-agentic-editor";
import { WorkflowBuilderView } from "./workflow-builder.workflow-builder.view";
import { type WorkflowCanvasNodeType } from "./workflow-canvas-node";

export function useWorkflowBuilderController({ workspaceId, initialWorkflow, agents }: { workspaceId: string; initialWorkflow: WorkflowDetail; agents: AgentOption[] }) {
  const t = useTranslations("workflows");
  const [workflow, setWorkflow] = useState(initialWorkflow);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowCanvasNodeType>(canvasNodes(initialWorkflow.definition));
  const [edges, setEdges, onEdgesChange] = useEdgesState(canvasEdges(initialWorkflow.definition));
  const [flow, setFlow] = useState<ReactFlowInstance<WorkflowCanvasNodeType> | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [runSheetOpen, setRunSheetOpen] = useState(false);
  const [runInput, setRunInput] = useState('{\n  "message": "Bonjour"\n}');
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsLoaded, setRunsLoaded] = useState(false);
  const [runsLoadError, setRunsLoadError] = useState<string | null>(null);
  const runsLoadedRef = useRef(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [paletteCategory, setPaletteCategory] = useState<WorkflowNodeCategory>("all");
  const [runDetail, setRunDetail] = useState<WorkflowRunDetail | null>(null);
  const [runDetailLoading, setRunDetailLoading] = useState(false);
  const [runDetailOpen, setRunDetailOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [editorMode, setEditorMode] = useState<"visual" | "agentic">("visual");

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const manualTriggerExists = nodes.some((node) => node.data.workflowType === "trigger.manual");
  const filteredCatalog = useMemo(() => {
    const search = paletteSearch.trim().toLocaleLowerCase();
    return WORKFLOW_NODE_CATALOG.filter((item) => {
      if (paletteCategory !== "all" && item.category !== paletteCategory) return false;
      if (!search) return true;
      return `${t(`nodes.${item.type}`)} ${t(`nodeDescriptions.${item.type}`)}`.toLocaleLowerCase().includes(search);
    });
  }, [paletteCategory, paletteSearch, t]);

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    setRunsLoadError(null);
    try {
      const payload = await fetchJson<{ runs: WorkflowRun[] }>(`/api/workspace/workflows/${workflow.id}/runs?workspaceId=${workspaceId}`);
      setRuns(payload.runs);
      setRunsLoaded(true);
      runsLoadedRef.current = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : t("runsLoadFailed");
      setRunsLoadError(message);
      if (runsLoadedRef.current) toast.error(message);
    } finally {
      setRunsLoading(false);
    }
  }, [t, workflow.id, workspaceId]);

  const { agenticMessages, agenticPendingRequests, agenticRunRequests, agenticTodoList, agenticHistoryLoading, submittingAgenticRequestId, decidingAgenticRunRequestId, agenticActivities, agenticInput, setAgenticInput, agenticRunning, agenticAgentName, agenticAbortRef, runAgenticBuilder, submitAgenticRequest, decideAgenticRunRequest } = useWorkflowAgenticEditor({ workspaceId, workflow, setWorkflow, nodes, edges, setNodes, setEdges, setSelectedNodeId, flow, loadRuns, loadRunDetail });
  const actionBusy = saving || publishing || running || agenticRunning;

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadRuns(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadRuns]);

  useEffect(() => {
    if (!runs.some((run) => run.status === "queued" || run.status === "running")) return;
    const interval = window.setInterval(() => void loadRuns(), 2_500);
    return () => window.clearInterval(interval);
  }, [loadRuns, runs]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isFullscreen]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void flow?.fitView({ padding: 0.2 }), 180);
    return () => window.clearTimeout(timeout);
  }, [editorMode, flow, isFullscreen]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            id: `edge-${crypto.randomUUID()}`,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { strokeWidth: 1.6 },
          },
          current,
        ),
      );
    },
    [setEdges],
  );

  function addNode(type: WorkflowNodeType) {
    if (type === "trigger.manual" && manualTriggerExists) return;
    const catalogItem = workflowNodeCatalogItem(type);
    const id = `${type.split(".").at(-1)}-${crypto.randomUUID().slice(0, 8)}`;
    const selected = nodes.find((node) => node.id === selectedNodeId);
    const selectedCanConnect = selected && selected.data.workflowType !== "logic.condition" && selected.data.workflowType !== "logic.stop";
    const nextNode: WorkflowCanvasNodeType = {
      id,
      type: "workflow",
      deletable: type !== "trigger.manual",
      position: selected ? { x: selected.position.x + 280, y: selected.position.y } : { x: 280 + (nodes.length % 3) * 260, y: 100 + nodes.length * 34 },
      data: {
        label: t(`nodes.${type}`),
        workflowType: type,
        parameters: structuredClone(catalogItem.defaultParameters),
        settings: { timeoutMs: 30_000, maxRetries: 0, retryDelayMs: 1_000 },
      },
    };
    setNodes((current) => [...current, nextNode]);
    if (selectedCanConnect) {
      setEdges((current) =>
        addEdge(
          {
            id: `edge-${selected.id}-out-${id}`,
            source: selected.id,
            target: id,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { strokeWidth: 1.6 },
          },
          current,
        ),
      );
    }
    setSelectedNodeId(id);
    setPaletteOpen(false);
    window.setTimeout(() => void flow?.fitView({ padding: 0.2, duration: 250 }), 0);
  }

  function updateSelectedNode(patch: Partial<WorkflowCanvasNodeType["data"]>) {
    if (!selectedNodeId) return;
    setNodes((current) => current.map((node) => (node.id === selectedNodeId ? { ...node, data: { ...node.data, ...patch } } : node)));
  }

  function updateParameters(patch: Record<string, unknown>) {
    if (!selectedNode) return;
    updateSelectedNode({
      parameters: { ...selectedNode.data.parameters, ...patch },
    });
  }

  async function save(): Promise<WorkflowDetail | null> {
    setSaving(true);
    try {
      const payload = await fetchJson<{ workflow: WorkflowDetail }>(`/api/workspace/workflows/${workflow.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name: workflow.name,
          description: workflow.description,
          definition: workflowDefinition(nodes, edges),
        }),
      });
      setWorkflow(payload.workflow);
      toast.success(t("saved"));
      return payload.workflow;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveFailed"));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    setPublishing(true);
    try {
      const saved = await save();
      if (!saved) return;
      const payload = await fetchJson<{ workflow: WorkflowDetail }>(`/api/workspace/workflows/${workflow.id}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      setWorkflow((current) => ({ ...current, ...payload.workflow }));
      toast.success(t("published"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("publishFailed"));
    } finally {
      setPublishing(false);
    }
  }

  async function runWorkflow() {
    let input: unknown;
    try {
      input = JSON.parse(runInput);
    } catch {
      toast.error(t("invalidJson"));
      return;
    }
    setRunning(true);
    try {
      const saved = await save();
      if (!saved) return;
      await fetchJson(`/api/workspace/workflows/${workflow.id}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, input, useLatestDraft: true }),
      });
      setRunSheetOpen(false);
      toast.success(t("runStarted"));
      await loadRuns();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("runFailed"));
    } finally {
      setRunning(false);
    }
  }

  async function loadRunDetail(runId: string) {
    setRunDetail(null);
    setRunDetailOpen(true);
    setRunDetailLoading(true);
    try {
      const payload = await fetchJson<{ run: WorkflowRunDetail }>(`/api/workspace/workflow-runs/${runId}?workspaceId=${workspaceId}`);
      setRunDetail(payload.run);
    } catch (error) {
      setRunDetailOpen(false);
      toast.error(error instanceof Error ? error.message : t("runDetailFailed"));
    } finally {
      setRunDetailLoading(false);
    }
  }

  useEffect(() => {
    if (!runDetailOpen || !runDetail || (runDetail.status !== "queued" && runDetail.status !== "running")) {
      return;
    }
    const interval = window.setInterval(async () => {
      try {
        const payload = await fetchJson<{ run: WorkflowRunDetail }>(`/api/workspace/workflow-runs/${runDetail.id}?workspaceId=${workspaceId}`);
        setRunDetail(payload.run);
        if (payload.run.status !== "queued" && payload.run.status !== "running") {
          await loadRuns();
        }
      } catch {
        // Keep the last visible snapshot; the user can retry from the runs tab.
      }
    }, 1_500);
    return () => window.clearInterval(interval);
  }, [loadRuns, runDetail, runDetailOpen, workspaceId]);
  function removeSelectedNode() {
    if (!selectedNode || selectedNode.data.workflowType === "trigger.manual") return;
    setNodes((current) => current.filter((node) => node.id !== selectedNode.id));
    setEdges((current) => current.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id));
    setSelectedNodeId(null);
  }
  return { kind: "ready", actionBusy, addNode, removeSelectedNode, agenticAbortRef, agenticActivities, agenticAgentName, agenticHistoryLoading, agenticInput, agenticMessages, agenticPendingRequests, agenticRunRequests, agenticRunning, agenticTodoList, agents, decideAgenticRunRequest, decidingAgenticRunRequestId, edges, editorMode, filteredCatalog, inspectorOpen, isDesktop, isFullscreen, loadRunDetail, loadRuns, manualTriggerExists, nodes, onConnect, onEdgesChange, onNodesChange, paletteCategory, paletteOpen, paletteSearch, publish, publishing, runAgenticBuilder, runDetail, runDetailLoading, runDetailOpen, runInput, runSheetOpen, runWorkflow, running, runs, runsLoadError, runsLoaded, runsLoading, save, saving, selectedNode, selectedNodeId, setAgenticInput, setEdges, setEditorMode, setFlow, setInspectorOpen, setIsFullscreen, setNodes, setPaletteCategory, setPaletteOpen, setPaletteSearch, setRunDetail, setRunDetailOpen, setRunInput, setRunSheetOpen, setSelectedNodeId, setWorkflow, submitAgenticRequest, submittingAgenticRequestId, t, updateParameters, updateSelectedNode, workflow } as const;
}

export function WorkflowBuilder(...args: Parameters<typeof useWorkflowBuilderController>) {
  const model = useWorkflowBuilderController(...args);
  if (!("kind" in model)) return model;
  return <WorkflowBuilderView model={model} />;
}
