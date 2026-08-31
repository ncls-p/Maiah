"use client";
import {
  addEdge,
  MarkerType,
  useEdgesState,
  useNodesState,
  type Connection,
  type ReactFlowInstance,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
} from "@xyflow/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { fetchJson } from "@/lib/api-client";
import {
  WORKFLOW_NODE_CATALOG,
  workflowNodeCatalogItem,
  type WorkflowNodeCategory,
} from "@/modules/workflows/catalog";
import { WorkflowNodeType } from "@/modules/workflows/contracts";
import { WorkflowDetail, WorkflowRun } from "./types";
import {
  AgentOption,
  canvasEdges,
  canvasNodes,
  nodeTypes,
} from "./workflow-builder.node-types";
import { useWorkflowActions } from "./workflow-builder.use-actions";
import { useWorkflowRunDetail } from "./workflow-builder.use-run-detail";
import { useWorkflowAgenticEditor } from "./workflow-builder.use-agentic-editor";
import { type WorkflowCanvasNodeType } from "./workflow-canvas-node";
import { createPortal } from "react-dom";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { WorkflowAgenticPanel } from "./workflow-agentic-panel";
import { useWorkflowConfigurationRenderer } from "./workflow-builder.workflow-builder.view.configuration-renderer";
import { useWorkflowPaletteRenderer } from "./workflow-builder.workflow-builder.view.palette-renderer";
import { useWorkflowRunsRenderer } from "./workflow-builder.workflow-builder.view.runs-renderer";
import { WorkflowBuilderRunSheet } from "./workflow-builder.run-sheet";
import {
  AlertCircleIcon,
  BotIcon,
  Maximize2Icon,
  Minimize2Icon,
  MousePointer2Icon,
  PanelLeftIcon,
  PanelRightIcon,
  PlayIcon,
  RefreshCwIcon,
  RocketIcon,
  SaveIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function useWorkflowBuilderController({
  workspaceId,
  initialWorkflow,
  agents,
}: {
  workspaceId: string;
  initialWorkflow: WorkflowDetail;
  agents: AgentOption[];
}) {
  const t = useTranslations("workflows");
  const [workflow, setWorkflow] = useState(initialWorkflow);
  const [nodes, setNodes, onNodesChange] =
    useNodesState<WorkflowCanvasNodeType>(
      canvasNodes(initialWorkflow.definition),
    );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    canvasEdges(initialWorkflow.definition),
  );
  const [flow, setFlow] =
    useState<ReactFlowInstance<WorkflowCanvasNodeType> | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsLoaded, setRunsLoaded] = useState(false);
  const [runsLoadError, setRunsLoadError] = useState<string | null>(null);
  const runsLoadedRef = useRef(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [paletteCategory, setPaletteCategory] =
    useState<WorkflowNodeCategory>("all");
  const [isDesktop, setIsDesktop] = useState(false);
  const [editorMode, setEditorMode] = useState<"visual" | "agentic">("visual");

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const manualTriggerExists = nodes.some(
    (node) => node.data.workflowType === "trigger.manual",
  );
  const filteredCatalog = useMemo(() => {
    const search = paletteSearch.trim().toLocaleLowerCase();
    return WORKFLOW_NODE_CATALOG.filter((item) => {
      if (paletteCategory !== "all" && item.category !== paletteCategory)
        return false;
      if (!search) return true;
      return `${t(`nodes.${item.type}`)} ${t(`nodeDescriptions.${item.type}`)}`
        .toLocaleLowerCase()
        .includes(search);
    });
  }, [paletteCategory, paletteSearch, t]);

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    setRunsLoadError(null);
    try {
      const payload = await fetchJson<{ runs: WorkflowRun[] }>(
        `/api/workspace/workflows/${workflow.id}/runs?workspaceId=${workspaceId}`,
      );
      setRuns(payload.runs);
      setRunsLoaded(true);
      runsLoadedRef.current = true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("runsLoadFailed");
      setRunsLoadError(message);
      if (runsLoadedRef.current) toast.error(message);
    } finally {
      setRunsLoading(false);
    }
  }, [t, workflow.id, workspaceId]);

  const {
    publish,
    publishing,
    runInput,
    runInputDirty,
    runInputValid,
    runSheetOpen,
    runWorkflow,
    running,
    save,
    saving,
    setRunInput,
    setRunSheetOpen,
  } = useWorkflowActions({
    workspaceId,
    workflow,
    setWorkflow,
    nodes,
    edges,
    loadRuns,
  });
  const {
    loadRunDetail,
    runDetail,
    runDetailLoading,
    runDetailOpen,
    setRunDetail,
    setRunDetailOpen,
  } = useWorkflowRunDetail({ workspaceId, loadRuns });
  const {
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
  } = useWorkflowAgenticEditor({
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
  });
  const actionBusy = saving || publishing || running || agenticRunning;

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadRuns(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadRuns]);

  useEffect(() => {
    if (
      !runs.some((run) => run.status === "queued" || run.status === "running")
    )
      return;
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
    const timeout = window.setTimeout(
      () => void flow?.fitView({ padding: 0.2 }),
      180,
    );
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
    const selectedCanConnect =
      selected &&
      selected.data.workflowType !== "logic.condition" &&
      selected.data.workflowType !== "logic.stop";
    const nextNode: WorkflowCanvasNodeType = {
      id,
      type: "workflow",
      deletable: type !== "trigger.manual",
      position: selected
        ? { x: selected.position.x + 280, y: selected.position.y }
        : { x: 280 + (nodes.length % 3) * 260, y: 100 + nodes.length * 34 },
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
    window.setTimeout(
      () => void flow?.fitView({ padding: 0.2, duration: 250 }),
      0,
    );
  }

  function updateSelectedNode(patch: Partial<WorkflowCanvasNodeType["data"]>) {
    if (!selectedNodeId) return;
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNodeId
          ? { ...node, data: { ...node.data, ...patch } }
          : node,
      ),
    );
  }

  function updateParameters(patch: Record<string, unknown>) {
    if (!selectedNode) return;
    updateSelectedNode({
      parameters: { ...selectedNode.data.parameters, ...patch },
    });
  }

  function removeSelectedNode() {
    if (!selectedNode || selectedNode.data.workflowType === "trigger.manual")
      return;
    setNodes((current) =>
      current.filter((node) => node.id !== selectedNode.id),
    );
    setEdges((current) =>
      current.filter(
        (edge) =>
          edge.source !== selectedNode.id && edge.target !== selectedNode.id,
      ),
    );
    setSelectedNodeId(null);
  }
  return {
    kind: "ready",
    actionBusy,
    addNode,
    removeSelectedNode,
    agenticAbortRef,
    agenticActivities,
    agenticAgentName,
    agenticHistoryLoading,
    agenticInput,
    agenticMessages,
    agenticPendingRequests,
    agenticRunRequests,
    agenticRunning,
    agenticTodoList,
    agents,
    decideAgenticRunRequest,
    decidingAgenticRunRequestId,
    edges,
    editorMode,
    filteredCatalog,
    inspectorOpen,
    isDesktop,
    isFullscreen,
    loadRunDetail,
    loadRuns,
    manualTriggerExists,
    nodes,
    onConnect,
    onEdgesChange,
    onNodesChange,
    paletteCategory,
    paletteOpen,
    paletteSearch,
    publish,
    publishing,
    runAgenticBuilder,
    runDetail,
    runDetailLoading,
    runDetailOpen,
    runInput,
    runInputDirty,
    runInputValid,
    runSheetOpen,
    runWorkflow,
    running,
    runs,
    runsLoadError,
    runsLoaded,
    runsLoading,
    save,
    saving,
    selectedNode,
    selectedNodeId,
    setAgenticInput,
    setEdges,
    setEditorMode,
    setFlow,
    setInspectorOpen,
    setIsFullscreen,
    setNodes,
    setPaletteCategory,
    setPaletteOpen,
    setPaletteSearch,
    setRunDetail,
    setRunDetailOpen,
    setRunInput,
    setRunSheetOpen,
    setSelectedNodeId,
    setWorkflow,
    submitAgenticRequest,
    submittingAgenticRequestId,
    t,
    updateParameters,
    updateSelectedNode,
    workflow,
  } as const;
}

export function WorkflowBuilder(
  ...args: Parameters<typeof useWorkflowBuilderController>
) {
  const model = useWorkflowBuilderController(...args);
  if (!("kind" in model)) return model;
  return <WorkflowBuilderView model={model} />;
}

export type WorkflowBuilderViewModel = Extract<
  ReturnType<typeof useWorkflowBuilderController>,
  { kind: "ready" }
>;
export function WorkflowBuilderView({
  model,
}: {
  model: WorkflowBuilderViewModel;
}) {
  const {
    agenticAbortRef,
    agenticActivities,
    agenticAgentName,
    agenticHistoryLoading,
    agenticInput,
    agenticMessages,
    agenticPendingRequests,
    agenticRunRequests,
    agenticRunning,
    agenticTodoList,
    decideAgenticRunRequest,
    decidingAgenticRunRequestId,
    edges,
    editorMode,
    inspectorOpen,
    isDesktop,
    isFullscreen,
    nodes,
    onConnect,
    onEdgesChange,
    onNodesChange,
    paletteOpen,
    runAgenticBuilder,
    selectedNodeId,
    setAgenticInput,
    setFlow,
    setInspectorOpen,
    setPaletteOpen,
    setSelectedNodeId,
    submitAgenticRequest,
    submittingAgenticRequestId,
    t,
  } = model;

  const renderPalette = useWorkflowPaletteRenderer(model);
  const renderConfiguration = useWorkflowConfigurationRenderer(model);
  const renderRuns = useWorkflowRunsRenderer(model);

  function renderInspector(suffix: string) {
    return (
      <Tabs defaultValue="configuration" className="h-full min-h-0 gap-0">
        <TabsList variant="line" className="mx-4 mt-3 w-[calc(100%-2rem)]">
          <TabsTrigger value="configuration">{t("configuration")}</TabsTrigger>
          <TabsTrigger value="runs">{t("runs")}</TabsTrigger>
        </TabsList>
        <TabsContent value="configuration" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            {renderConfiguration(suffix)}
          </ScrollArea>
        </TabsContent>
        <TabsContent value="runs" className="min-h-0 flex-1">
          <ScrollArea className="h-full">{renderRuns()}</ScrollArea>
        </TabsContent>
      </Tabs>
    );
  }

  const canvas = (
    <main
      className={cn(
        "relative h-full bg-muted/10",
        editorMode === "visual" ? "min-h-[28rem] sm:min-h-[34rem]" : "min-h-0",
      )}
    >
      <ReactFlow<WorkflowCanvasNodeType>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={setFlow}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => {
          setSelectedNodeId(node.id);
          if (
            editorMode === "agentic" ||
            !window.matchMedia("(min-width: 1024px)").matches
          ) {
            setInspectorOpen(true);
          }
        }}
        onNodesDelete={(deleted) => {
          if (deleted.some((node) => node.id === selectedNodeId))
            setSelectedNodeId(null);
        }}
        onPaneClick={() => setSelectedNodeId(null)}
        fitView
        fitViewOptions={{ padding: 0.24 }}
        minZoom={0.25}
        maxZoom={1.8}
        nodesDraggable
        nodesConnectable
        edgesReconnectable
        elementsSelectable
        deleteKeyCode={["Backspace", "Delete"]}
        snapToGrid
        snapGrid={[16, 16]}
        panOnScroll
        selectionOnDrag
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
        <Controls position="bottom-left" />
        <MiniMap
          pannable
          zoomable
          className="!border !border-border/70 !bg-card max-sm:!hidden"
          nodeColor="var(--foreground)"
          maskColor="color-mix(in oklab, var(--background) 75%, transparent)"
        />
      </ReactFlow>
      <div className="pointer-events-none absolute top-3 left-1/2 hidden -translate-x-1/2 rounded-full border border-border/70 bg-background/90 px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur sm:block">
        {editorMode === "agentic"
          ? t("agentic.canvasEditHint")
          : t("canvasHint")}
      </div>
    </main>
  );

  const builder = (
    <div
      data-workflow-builder
      className={cn(
        "flex h-[calc(100dvh-10rem)] min-h-[36rem] flex-col overflow-hidden rounded-2xl border border-border/75 bg-card shadow-[var(--surface-shadow)]",
        isFullscreen &&
          "fixed inset-0 z-50 h-dvh min-h-0 rounded-none border-0",
      )}
    >
      <WorkflowBuilderSection2 model={model} />

      {editorMode === "agentic" ? (
        isDesktop ? (
          <div className="min-h-0 flex-1">
            <ResizablePanelGroup orientation="horizontal">
              <ResizablePanel
                id="workflow-agentic-chat"
                defaultSize="36%"
                minSize="28%"
                maxSize="48%"
              >
                <WorkflowAgenticPanel
                  messages={agenticMessages}
                  activities={agenticActivities}
                  pendingRequests={agenticPendingRequests}
                  runRequests={agenticRunRequests}
                  todoList={agenticTodoList}
                  input={agenticInput}
                  running={agenticRunning}
                  historyLoading={agenticHistoryLoading}
                  submittingRequestId={submittingAgenticRequestId}
                  decidingRunRequestId={decidingAgenticRunRequestId}
                  agentName={agenticAgentName}
                  onInputChange={setAgenticInput}
                  onSubmit={(prompt) => void runAgenticBuilder(prompt)}
                  onSubmitRequest={(request, values) =>
                    void submitAgenticRequest(request, values)
                  }
                  onDecideRunRequest={(request, decision) =>
                    void decideAgenticRunRequest(request, decision)
                  }
                  onStop={() => agenticAbortRef.current?.abort()}
                />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel
                id="workflow-agentic-canvas"
                defaultSize="64%"
                minSize="40%"
              >
                {canvas}
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="h-[34%] min-h-36 border-b border-border/70">
              {canvas}
            </div>
            <div className="min-h-0 flex-1">
              <WorkflowAgenticPanel
                messages={agenticMessages}
                activities={agenticActivities}
                pendingRequests={agenticPendingRequests}
                runRequests={agenticRunRequests}
                todoList={agenticTodoList}
                input={agenticInput}
                running={agenticRunning}
                historyLoading={agenticHistoryLoading}
                submittingRequestId={submittingAgenticRequestId}
                decidingRunRequestId={decidingAgenticRunRequestId}
                agentName={agenticAgentName}
                onInputChange={setAgenticInput}
                onSubmit={(prompt) => void runAgenticBuilder(prompt)}
                onSubmitRequest={(request, values) =>
                  void submitAgenticRequest(request, values)
                }
                onDecideRunRequest={(request, decision) =>
                  void decideAgenticRunRequest(request, decision)
                }
                onStop={() => agenticAbortRef.current?.abort()}
              />
            </div>
          </div>
        )
      ) : isDesktop ? (
        <div className="min-h-0 flex-1">
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel
              id="workflow-palette"
              defaultSize="18%"
              minSize="14%"
              maxSize="30%"
            >
              {renderPalette("desktop")}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
              id="workflow-canvas"
              defaultSize="57%"
              minSize="35%"
            >
              {canvas}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
              id="workflow-inspector"
              defaultSize="25%"
              minSize="20%"
              maxSize="38%"
            >
              <aside className="h-full min-h-0 bg-background">
                {renderInspector("desktop")}
              </aside>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      ) : (
        <div className="min-h-0 flex-1">{canvas}</div>
      )}

      <Sheet open={paletteOpen} onOpenChange={setPaletteOpen}>
        <SheetContent side="left" className="w-[min(92vw,24rem)] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>{t("palette")}</SheetTitle>
            <SheetDescription>{t("paletteHint")}</SheetDescription>
          </SheetHeader>
          {renderPalette("mobile")}
        </SheetContent>
      </Sheet>

      <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
        <SheetContent
          side="right"
          className="w-[min(94vw,30rem)] p-0 sm:max-w-xl"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{t("configuration")}</SheetTitle>
            <SheetDescription>{t("configurationHint")}</SheetDescription>
          </SheetHeader>
          {renderInspector("mobile")}
        </SheetContent>
      </Sheet>

      <WorkflowBuilderRunSheet model={model} />

      <WorkflowBuilderSection1 model={model} />
    </div>
  );
  return isFullscreen ? createPortal(builder, document.body) : builder;
}

export function WorkflowBuilderSection1({
  model,
}: {
  model: WorkflowBuilderViewModel;
}) {
  const {
    nodes,
    runDetail,
    runDetailLoading,
    runDetailOpen,
    setRunDetail,
    setRunDetailOpen,
    t,
  } = model;
  return (
    <Sheet
      open={runDetailOpen}
      onOpenChange={(open) => {
        setRunDetailOpen(open);
        if (!open) setRunDetail(null);
      }}
    >
      <SheetContent className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t("runDetailTitle")}</SheetTitle>
          <SheetDescription>
            {runDetail
              ? `${runDetail.id.slice(0, 8)} · ${t(`status.${runDetail.status}`)}`
              : t("loading")}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1 px-5 pb-5">
          {runDetailLoading || !runDetail ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : (
            <div className="flex flex-col gap-4">
              {runDetail.error ? (
                <Alert variant="destructive">
                  <AlertCircleIcon />
                  <AlertTitle>{t("error")}</AlertTitle>
                  <AlertDescription className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
                    {runDetail.error}
                  </AlertDescription>
                </Alert>
              ) : null}
              {runDetail.steps.map((step) => (
                <div
                  key={step.nodeId}
                  className="rounded-xl border border-border/75 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">
                      {nodes.find((node) => node.id === step.nodeId)?.data
                        .label ?? step.nodeId}
                    </span>
                    <Badge
                      variant={
                        step.status === "failed" ? "destructive" : "secondary"
                      }
                    >
                      {t(`stepStatus.${step.status}`)}
                    </Badge>
                  </div>
                  {step.error ? (
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-destructive/10 p-3 font-mono text-xs text-destructive">
                      {step.error}
                    </pre>
                  ) : null}
                  <div className="mt-3 grid gap-3">
                    <div>
                      <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                        {t("stepInput")}
                      </p>
                      <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 text-[11px] leading-5">
                        {JSON.stringify(step.inputJson, null, 2)}
                      </pre>
                    </div>
                    {step.outputJson !== null &&
                    step.outputJson !== undefined ? (
                      <div>
                        <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                          {t("stepOutput")}
                        </p>
                        <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 text-[11px] leading-5">
                          {JSON.stringify(step.outputJson, null, 2)}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              {runDetail.outputJson !== null &&
              runDetail.outputJson !== undefined ? (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">{t("output")}</h3>
                  <pre className="max-h-72 overflow-auto rounded-xl bg-muted p-3 text-xs leading-5">
                    {JSON.stringify(runDetail.outputJson, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

export function WorkflowBuilderSection2({
  model,
}: {
  model: WorkflowBuilderViewModel;
}) {
  const {
    actionBusy,
    agenticRunning,
    editorMode,
    isFullscreen,
    publish,
    publishing,
    save,
    saving,
    setEditorMode,
    setInspectorOpen,
    setIsFullscreen,
    setPaletteOpen,
    setRunSheetOpen,
    setWorkflow,
    t,
    workflow,
  } = model;
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border/70 px-3 py-3 sm:gap-3 sm:px-4">
      <div className="min-w-44 flex-1 sm:min-w-56">
        <Input
          value={workflow.name}
          onChange={(event) =>
            setWorkflow((current) => ({
              ...current,
              name: event.target.value,
            }))
          }
          aria-label={t("workflowName")}
          className="h-8 max-w-md border-transparent bg-transparent px-1 text-base font-semibold shadow-none focus-visible:border-border"
        />
        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <Badge
            variant={workflow.status === "active" ? "default" : "secondary"}
          >
            {workflow.status === "active" ? t("active") : t("draft")}
          </Badge>
          <span>{t("version", { version: workflow.latestVersion })}</span>
          {workflow.activeVersion ? (
            <span>· API v{workflow.activeVersion}</span>
          ) : null}
        </div>
      </div>
      <div
        className="flex items-center rounded-lg border border-border/75 bg-muted/40 p-0.5"
        role="group"
        aria-label={t("mode")}
      >
        <Button
          type="button"
          variant={editorMode === "visual" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-1.5 shadow-none sm:px-2.5"
          aria-pressed={editorMode === "visual"}
          disabled={agenticRunning}
          onClick={() => setEditorMode("visual")}
        >
          <MousePointer2Icon data-icon="inline-start" />
          {t("visualMode")}
        </Button>
        <Button
          type="button"
          variant={editorMode === "agentic" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-1.5 shadow-none sm:px-2.5"
          aria-pressed={editorMode === "agentic"}
          disabled={agenticRunning}
          onClick={() => setEditorMode("agentic")}
        >
          <BotIcon data-icon="inline-start" />
          {t("agenticMode")}
        </Button>
      </div>
      {editorMode === "visual" ? (
        <>
          <Button
            variant="outline"
            size="icon"
            className="lg:hidden"
            aria-label={t("openPalette")}
            onClick={() => setPaletteOpen(true)}
          >
            <PanelLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="lg:hidden"
            aria-label={t("openInspector")}
            onClick={() => setInspectorOpen(true)}
          >
            <PanelRightIcon />
          </Button>
        </>
      ) : null}
      <Button
        variant="outline"
        size="icon"
        aria-label={isFullscreen ? t("exitFullscreen") : t("fullscreen")}
        aria-pressed={isFullscreen}
        onClick={() => setIsFullscreen((current) => !current)}
      >
        <span className="relative size-4">
          <Minimize2Icon
            className={cn(
              "absolute inset-0 transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
              isFullscreen
                ? "scale-100 opacity-100 blur-0"
                : "scale-[0.25] opacity-0 blur-[4px]",
            )}
          />
          <Maximize2Icon
            className={cn(
              "transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
              isFullscreen
                ? "scale-[0.25] opacity-0 blur-[4px]"
                : "scale-100 opacity-100 blur-0",
            )}
          />
        </span>
      </Button>
      <Button
        variant="outline"
        onClick={() => void save()}
        disabled={actionBusy}
        className="max-sm:px-3"
      >
        {saving ? (
          <RefreshCwIcon data-icon="inline-start" className="animate-spin" />
        ) : (
          <SaveIcon data-icon="inline-start" />
        )}
        <span className="max-sm:sr-only">
          {saving ? t("saving") : t("save")}
        </span>
      </Button>
      <Button
        variant="outline"
        onClick={() => setRunSheetOpen(true)}
        disabled={actionBusy}
        className="max-sm:px-3"
      >
        <PlayIcon data-icon="inline-start" />
        <span className="max-sm:sr-only">{t("run")}</span>
      </Button>
      <Button
        onClick={() => void publish()}
        disabled={actionBusy}
        className="max-sm:px-3"
      >
        {publishing ? (
          <RefreshCwIcon data-icon="inline-start" className="animate-spin" />
        ) : (
          <RocketIcon data-icon="inline-start" />
        )}
        <span className="max-sm:sr-only">
          {publishing ? t("publishing") : t("publish")}
        </span>
      </Button>
    </div>
  );
}
