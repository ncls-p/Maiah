"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  AlertCircleIcon,
  CheckIcon,
  Maximize2Icon,
  Minimize2Icon,
  PanelLeftIcon,
  PanelRightIcon,
  PlayIcon,
  RefreshCwIcon,
  RocketIcon,
  SaveIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AdvancedSection } from "@/components/ui/advanced-section";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { fetchJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
  WORKFLOW_NODE_CATALOG,
  WORKFLOW_NODE_CATEGORIES,
  workflowNodeCatalogItem,
  type WorkflowNodeCategory,
} from "@/modules/workflows/catalog";
import type {
  WorkflowDefinition,
  WorkflowNodeType,
} from "@/modules/workflows/contracts";

import {
  WorkflowCanvasNode,
  workflowNodeIconByType,
  type WorkflowCanvasNodeType,
} from "./workflow-canvas-node";
import { JsonValueEditor, WorkflowNodeFields } from "./workflow-node-fields";
import type { WorkflowDetail, WorkflowRun, WorkflowRunDetail } from "./types";

const nodeTypes = { workflow: WorkflowCanvasNode };

type AgentOption = { id: string; name: string };

function canvasNodes(definition: WorkflowDefinition): WorkflowCanvasNodeType[] {
  return definition.nodes.map((node) => ({
    id: node.id,
    type: "workflow",
    position: node.position,
    deletable: node.type !== "trigger.manual",
    data: {
      label: node.label,
      workflowType: node.type,
      parameters: node.parameters,
      settings: node.settings,
    },
  }));
}

function canvasEdges(definition: WorkflowDefinition): Edge[] {
  return definition.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? undefined,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { strokeWidth: 1.6 },
  }));
}

function workflowDefinition(
  nodes: WorkflowCanvasNodeType[],
  edges: Edge[],
): WorkflowDefinition {
  return {
    schemaVersion: 1,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data.workflowType,
      label: node.data.label,
      position: node.position,
      parameters: node.data.parameters,
      settings: node.data.settings,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle:
        edge.sourceHandle === "true" || edge.sourceHandle === "false"
          ? edge.sourceHandle
          : null,
    })),
  };
}

function runBadgeVariant(run: WorkflowRun) {
  if (run.status === "failed") return "destructive" as const;
  if (run.status === "completed") return "default" as const;
  return "secondary" as const;
}

export function WorkflowBuilder({
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
  const [paletteCategory, setPaletteCategory] =
    useState<WorkflowNodeCategory>("all");
  const [runDetail, setRunDetail] = useState<WorkflowRunDetail | null>(null);
  const [runDetailLoading, setRunDetailLoading] = useState(false);
  const [runDetailOpen, setRunDetailOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const actionBusy = saving || publishing || running;

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
  }, [flow, isFullscreen]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            id: `edge-${connection.source}-${connection.sourceHandle ?? "out"}-${connection.target}`,
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

  async function save(): Promise<WorkflowDetail | null> {
    setSaving(true);
    try {
      const payload = await fetchJson<{ workflow: WorkflowDetail }>(
        `/api/workspace/workflows/${workflow.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            name: workflow.name,
            description: workflow.description,
            definition: workflowDefinition(nodes, edges),
          }),
        },
      );
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
      const payload = await fetchJson<{ workflow: WorkflowDetail }>(
        `/api/workspace/workflows/${workflow.id}/publish`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId }),
        },
      );
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
      const payload = await fetchJson<{ run: WorkflowRunDetail }>(
        `/api/workspace/workflow-runs/${runId}?workspaceId=${workspaceId}`,
      );
      setRunDetail(payload.run);
    } catch (error) {
      setRunDetailOpen(false);
      toast.error(
        error instanceof Error ? error.message : t("runDetailFailed"),
      );
    } finally {
      setRunDetailLoading(false);
    }
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

  function renderPalette(suffix: string) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-muted/20">
        <div className="flex flex-col gap-3 p-4">
          <div>
            <h2 className="text-sm font-semibold">{t("palette")}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t("paletteHint")}
            </p>
          </div>
          <FieldGroup className="gap-2">
            <Field>
              <FieldLabel
                htmlFor={`workflow-node-search-${suffix}`}
                className="sr-only"
              >
                {t("searchNodes")}
              </FieldLabel>
              <Input
                id={`workflow-node-search-${suffix}`}
                value={paletteSearch}
                onChange={(event) => setPaletteSearch(event.target.value)}
                placeholder={t("searchNodes")}
              />
            </Field>
            <Field>
              <FieldLabel
                htmlFor={`workflow-node-category-${suffix}`}
                className="sr-only"
              >
                {t("category")}
              </FieldLabel>
              <Select
                value={paletteCategory}
                onValueChange={(value) =>
                  setPaletteCategory(value as WorkflowNodeCategory)
                }
              >
                <SelectTrigger
                  id={`workflow-node-category-${suffix}`}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {WORKFLOW_NODE_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {t(`categories.${category}`)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </div>
        <ScrollArea className="min-h-0 flex-1 px-3 pb-3">
          <div className="flex flex-col gap-2">
            {filteredCatalog.map((item) => {
              const Icon = workflowNodeIconByType[item.type];
              const disabled =
                item.type === "trigger.manual" && manualTriggerExists;
              return (
                <button
                  key={item.type}
                  type="button"
                  disabled={disabled}
                  onClick={() => addNode(item.type)}
                  className="group flex w-full items-start gap-3 rounded-xl border border-border/70 bg-background p-3 text-left transition-[background-color,border-color,scale] duration-150 ease-out hover:border-foreground/25 hover:bg-accent active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:text-foreground">
                    <Icon aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold">
                      {t(`nodes.${item.type}`)}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                      {t(`nodeDescriptions.${item.type}`)}
                    </span>
                  </span>
                </button>
              );
            })}
            {filteredCatalog.length === 0 ? (
              <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                {t("noNodeResults")}
              </p>
            ) : null}
          </div>
        </ScrollArea>
      </div>
    );
  }

  function renderConfiguration(suffix: string) {
    if (!selectedNode) {
      return (
        <Empty className="m-4 min-h-56 p-5">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SlidersHorizontalIcon />
            </EmptyMedia>
            <EmptyTitle>{t("noSelectionTitle")}</EmptyTitle>
            <EmptyDescription>{t("noSelection")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }
    const catalogItem = workflowNodeCatalogItem(selectedNode.data.workflowType);
    return (
      <div className="flex flex-col gap-5 p-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`workflow-node-label-${suffix}`}>
              {t("nodeName")}
            </FieldLabel>
            <Input
              id={`workflow-node-label-${suffix}`}
              value={selectedNode.data.label}
              onChange={(event) =>
                updateSelectedNode({ label: event.target.value })
              }
            />
          </Field>
        </FieldGroup>
        <WorkflowNodeFields
          nodeId={`${selectedNode.id}-${suffix}`}
          catalogItem={catalogItem}
          parameters={selectedNode.data.parameters}
          agents={agents}
          onChange={updateParameters}
        />
        <AdvancedSection
          label={t("expertSettings")}
          hint={t("expertSettingsHint")}
          icon={SlidersHorizontalIcon}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`workflow-timeout-${suffix}`}>
                {t("timeout")}
              </FieldLabel>
              <Input
                id={`workflow-timeout-${suffix}`}
                type="number"
                min={250}
                max={120000}
                value={selectedNode.data.settings.timeoutMs}
                onChange={(event) =>
                  updateSelectedNode({
                    settings: {
                      ...selectedNode.data.settings,
                      timeoutMs: Number(event.target.value),
                    },
                  })
                }
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor={`workflow-retries-${suffix}`}>
                  {t("retries")}
                </FieldLabel>
                <Input
                  id={`workflow-retries-${suffix}`}
                  type="number"
                  min={0}
                  max={5}
                  value={selectedNode.data.settings.maxRetries}
                  onChange={(event) =>
                    updateSelectedNode({
                      settings: {
                        ...selectedNode.data.settings,
                        maxRetries: Number(event.target.value),
                      },
                    })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`workflow-retry-delay-${suffix}`}>
                  {t("retryDelay")}
                </FieldLabel>
                <Input
                  id={`workflow-retry-delay-${suffix}`}
                  type="number"
                  min={0}
                  max={60000}
                  value={selectedNode.data.settings.retryDelayMs}
                  onChange={(event) =>
                    updateSelectedNode({
                      settings: {
                        ...selectedNode.data.settings,
                        retryDelayMs: Number(event.target.value),
                      },
                    })
                  }
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor={`workflow-raw-parameters-${suffix}`}>
                {t("parameters")}
              </FieldLabel>
              <JsonValueEditor
                key={`${selectedNode.id}:${JSON.stringify(selectedNode.data.parameters)}:${suffix}`}
                id={`workflow-raw-parameters-${suffix}`}
                value={selectedNode.data.parameters}
                onChange={(parameters) => {
                  if (
                    typeof parameters === "object" &&
                    parameters !== null &&
                    !Array.isArray(parameters)
                  ) {
                    updateSelectedNode({
                      parameters: parameters as Record<string, unknown>,
                    });
                  }
                }}
                className="min-h-40 font-mono text-xs"
              />
            </Field>
          </FieldGroup>
        </AdvancedSection>
        {selectedNode.data.workflowType !== "trigger.manual" ? (
          <Button variant="destructive" onClick={removeSelectedNode}>
            <Trash2Icon data-icon="inline-start" />
            {t("deleteNode")}
          </Button>
        ) : null}
      </div>
    );
  }

  function renderRuns() {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadRuns()}
          disabled={runsLoading}
        >
          <RefreshCwIcon
            data-icon="inline-start"
            className={runsLoading ? "animate-spin" : undefined}
          />
          {t("refreshRuns")}
        </Button>
        {!runsLoaded && runsLoading ? (
          <Empty className="min-h-48 p-5">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Spinner />
              </EmptyMedia>
              <EmptyTitle>{t("loading")}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : !runsLoaded && runsLoadError ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>{t("runsLoadFailed")}</AlertTitle>
            <AlertDescription>
              <p>{runsLoadError}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadRuns()}
              >
                {t("refreshRuns")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : runs.length === 0 ? (
          <Empty className="min-h-48 p-5">
            <EmptyHeader>
              <EmptyTitle>{t("noRuns")}</EmptyTitle>
              <EmptyDescription>{t("noRunsHint")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          runs.map((run) => (
            <button
              type="button"
              key={run.id}
              onClick={() => void loadRunDetail(run.id)}
              className="rounded-xl border border-border/75 p-3 text-left transition-[background-color,scale] duration-150 ease-out hover:bg-muted/60 active:scale-[0.96]"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">
                  {run.id.slice(0, 8)}
                </span>
                <Badge variant={runBadgeVariant(run)}>
                  {run.status === "completed" ? (
                    <CheckIcon aria-hidden="true" />
                  ) : null}
                  {t(`status.${run.status}`)}
                </Badge>
              </span>
              <span className="mt-2 block text-xs tabular-nums text-muted-foreground">
                {new Date(run.queuedAt).toLocaleString()}
              </span>
              {run.error ? (
                <span className="mt-2 line-clamp-3 block text-xs text-destructive">
                  {run.error}
                </span>
              ) : null}
            </button>
          ))
        )}
      </div>
    );
  }

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
    <main className="relative h-full min-h-[28rem] bg-muted/10 sm:min-h-[34rem]">
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
          if (!window.matchMedia("(min-width: 1024px)").matches) {
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
        {t("canvasHint")}
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
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-3 sm:gap-3 sm:px-4">
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

      {isDesktop ? (
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

      <Sheet open={runSheetOpen} onOpenChange={setRunSheetOpen}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{t("runTitle")}</SheetTitle>
            <SheetDescription className="leading-6">
              {t("runDescription")}
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-4 px-5 pb-5">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="workflow-run-input">
                  {t("runInput")}
                </FieldLabel>
                <Textarea
                  id="workflow-run-input"
                  value={runInput}
                  onChange={(event) => setRunInput(event.target.value)}
                  className="min-h-72 font-mono text-xs"
                  spellCheck={false}
                />
              </Field>
            </FieldGroup>
            <Button
              onClick={() => void runWorkflow()}
              disabled={actionBusy}
              className="mt-auto"
            >
              {running ? (
                <RefreshCwIcon
                  data-icon="inline-start"
                  className="animate-spin"
                />
              ) : (
                <PlayIcon data-icon="inline-start" />
              )}
              {t("runNow")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

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
                      <p className="mt-2 text-xs text-destructive">
                        {step.error}
                      </p>
                    ) : null}
                    {step.outputJson !== null &&
                    step.outputJson !== undefined ? (
                      <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-muted p-3 text-[11px] leading-5">
                        {JSON.stringify(step.outputJson, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                ))}
                {runDetail.outputJson !== null &&
                runDetail.outputJson !== undefined ? (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">
                      {t("output")}
                    </h3>
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
    </div>
  );

  return isFullscreen ? createPortal(builder, document.body) : builder;
}
