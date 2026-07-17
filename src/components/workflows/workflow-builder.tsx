"use client";

import { useCallback, useEffect, useState } from "react";
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
} from "@xyflow/react";
import {
  BotIcon,
  BracesIcon,
  CheckIcon,
  Code2Icon,
  GitBranchIcon,
  PlayIcon,
  RefreshCwIcon,
  RocketIcon,
  SaveIcon,
  Trash2Icon,
  WebhookIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { fetchJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { WORKFLOW_NODE_CATALOG } from "@/modules/workflows/catalog";
import type {
  WorkflowDefinition,
  WorkflowNodeType,
} from "@/modules/workflows/contracts";

import {
  WorkflowCanvasNode,
  type WorkflowCanvasNodeType,
} from "./workflow-canvas-node";
import type { WorkflowDetail, WorkflowRun } from "./types";

const nodeTypes = { workflow: WorkflowCanvasNode };
const paletteIcons = {
  "trigger.manual": PlayIcon,
  "agent.run": BotIcon,
  "http.request": WebhookIcon,
  "code.execute": Code2Icon,
  "data.set": BracesIcon,
  "logic.condition": GitBranchIcon,
} as const;

type AgentOption = { id: string; name: string };

function canvasNodes(definition: WorkflowDefinition): WorkflowCanvasNodeType[] {
  return definition.nodes.map((node) => ({
    id: node.id,
    type: "workflow",
    position: node.position,
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

function JsonEditor({
  value,
  onChange,
  className,
}: {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  className?: string;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [invalid, setInvalid] = useState(false);
  return (
    <Textarea
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        setInvalid(false);
      }}
      onBlur={() => {
        try {
          const parsed = JSON.parse(text) as unknown;
          if (
            typeof parsed !== "object" ||
            parsed === null ||
            Array.isArray(parsed)
          ) {
            setInvalid(true);
            return;
          }
          setInvalid(false);
          onChange(parsed as Record<string, unknown>);
        } catch {
          setInvalid(true);
        }
      }}
      aria-invalid={invalid}
      className={cn("min-h-40 font-mono text-xs", className)}
    />
  );
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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [runSheetOpen, setRunSheetOpen] = useState(false);
  const [runInput, setRunInput] = useState('{\n  "message": "Bonjour"\n}');
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const manualTriggerExists = nodes.some(
    (node) => node.data.workflowType === "trigger.manual",
  );

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    try {
      const payload = await fetchJson<{ runs: WorkflowRun[] }>(
        `/api/workspace/workflows/${workflow.id}/runs?workspaceId=${workspaceId}`,
      );
      setRuns(payload.runs);
    } finally {
      setRunsLoading(false);
    }
  }, [workflow.id, workspaceId]);

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
    const catalogItem = WORKFLOW_NODE_CATALOG.find(
      (item) => item.type === type,
    );
    if (!catalogItem) return;
    const id = `${type.split(".").at(-1)}-${crypto.randomUUID().slice(0, 8)}`;
    const nextNode: WorkflowCanvasNodeType = {
      id,
      type: "workflow",
      position: {
        x: 280 + (nodes.length % 3) * 260,
        y: 100 + nodes.length * 34,
      },
      data: {
        label: t(`nodes.${type}`),
        workflowType: type,
        parameters: structuredClone(catalogItem.defaultParameters),
        settings: { timeoutMs: 30_000, maxRetries: 0, retryDelayMs: 1_000 },
      },
    };
    setNodes((current) => [...current, nextNode]);
    setSelectedNodeId(id);
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

  return (
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col overflow-hidden rounded-2xl border border-border/75 bg-card shadow-[var(--surface-shadow)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-border/70 px-4 py-3">
        <div className="min-w-56 flex-1">
          <Input
            value={workflow.name}
            onChange={(event) =>
              setWorkflow((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            aria-label={t("nodeName")}
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
          onClick={() => void save()}
          disabled={saving || publishing}
        >
          {saving ? (
            <RefreshCwIcon data-icon="inline-start" className="animate-spin" />
          ) : (
            <SaveIcon data-icon="inline-start" />
          )}
          {saving ? t("saving") : t("save")}
        </Button>
        <Button variant="outline" onClick={() => setRunSheetOpen(true)}>
          <PlayIcon data-icon="inline-start" />
          {t("run")}
        </Button>
        <Button onClick={() => void publish()} disabled={publishing || saving}>
          {publishing ? (
            <RefreshCwIcon data-icon="inline-start" className="animate-spin" />
          ) : (
            <RocketIcon data-icon="inline-start" />
          )}
          {publishing ? t("publishing") : t("publish")}
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[14rem_minmax(0,1fr)_19rem]">
        <aside className="border-b border-border/70 bg-muted/20 lg:border-r lg:border-b-0">
          <div className="p-4">
            <h2 className="text-sm font-semibold">{t("palette")}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t("paletteHint")}
            </p>
          </div>
          <ScrollArea className="h-[18rem] px-3 pb-3 lg:h-[calc(100dvh-18rem)]">
            <div className="flex flex-col gap-2">
              {WORKFLOW_NODE_CATALOG.map((item) => {
                const Icon = paletteIcons[item.type];
                const disabled =
                  item.type === "trigger.manual" && manualTriggerExists;
                return (
                  <button
                    key={item.type}
                    type="button"
                    disabled={disabled}
                    onClick={() => addNode(item.type)}
                    className="flex w-full items-start gap-3 rounded-xl border border-border/70 bg-background p-3 text-left transition-colors hover:border-foreground/25 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Icon className="mt-0.5 shrink-0" aria-hidden="true" />
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
            </div>
          </ScrollArea>
        </aside>

        <main className="relative min-h-[32rem] bg-muted/10">
          <ReactFlow<WorkflowCanvasNodeType>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            fitView
            fitViewOptions={{ padding: 0.24 }}
            minZoom={0.25}
            maxZoom={1.8}
            deleteKeyCode={null}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
            <Controls position="bottom-left" />
            <MiniMap
              pannable
              zoomable
              className="!border !border-border/70 !bg-card"
              nodeColor="var(--foreground)"
              maskColor="color-mix(in oklab, var(--background) 75%, transparent)"
            />
          </ReactFlow>
          <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full border border-border/70 bg-background/90 px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
            {t("canvasHint")}
          </div>
        </main>

        <aside className="min-h-0 border-t border-border/70 bg-background lg:border-t-0 lg:border-l">
          <Tabs defaultValue="configuration" className="h-full gap-0">
            <TabsList variant="line" className="mx-4 mt-3 w-[calc(100%-2rem)]">
              <TabsTrigger value="configuration">
                {t("configuration")}
              </TabsTrigger>
              <TabsTrigger value="runs">{t("runs")}</TabsTrigger>
            </TabsList>
            <TabsContent value="configuration" className="min-h-0">
              <ScrollArea className="h-[calc(100dvh-15rem)]">
                <div className="flex flex-col gap-5 p-4">
                  {selectedNode ? (
                    <>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="workflow-node-label">
                          {t("nodeName")}
                        </Label>
                        <Input
                          id="workflow-node-label"
                          value={selectedNode.data.label}
                          onChange={(event) =>
                            updateSelectedNode({ label: event.target.value })
                          }
                        />
                      </div>
                      {selectedNode.data.workflowType === "agent.run" ? (
                        <>
                          <div className="flex flex-col gap-2">
                            <Label>{t("agent")}</Label>
                            <Select
                              value={String(
                                selectedNode.data.parameters.agentId ?? "",
                              )}
                              onValueChange={(value) =>
                                updateParameters({ agentId: value })
                              }
                            >
                              <SelectTrigger aria-label={t("agent")}>
                                <SelectValue placeholder={t("agent")} />
                              </SelectTrigger>
                              <SelectContent>
                                {agents.map((agent) => (
                                  <SelectItem key={agent.id} value={agent.id}>
                                    {agent.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex flex-col gap-2">
                            <Label htmlFor="workflow-agent-prompt">
                              {t("prompt")}
                            </Label>
                            <Textarea
                              id="workflow-agent-prompt"
                              value={String(
                                selectedNode.data.parameters.prompt ?? "",
                              )}
                              onChange={(event) =>
                                updateParameters({ prompt: event.target.value })
                              }
                              className="min-h-32"
                            />
                          </div>
                        </>
                      ) : null}
                      {selectedNode.data.workflowType === "http.request" ? (
                        <>
                          <div className="flex flex-col gap-2">
                            <Label>{t("method")}</Label>
                            <Select
                              value={String(
                                selectedNode.data.parameters.method ?? "GET",
                              )}
                              onValueChange={(value) =>
                                updateParameters({ method: value })
                              }
                            >
                              <SelectTrigger aria-label={t("method")}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {["GET", "POST", "PUT", "PATCH", "DELETE"].map(
                                  (method) => (
                                    <SelectItem key={method} value={method}>
                                      {method}
                                    </SelectItem>
                                  ),
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex flex-col gap-2">
                            <Label htmlFor="workflow-http-url">
                              {t("url")}
                            </Label>
                            <Input
                              id="workflow-http-url"
                              value={String(
                                selectedNode.data.parameters.url ?? "",
                              )}
                              onChange={(event) =>
                                updateParameters({ url: event.target.value })
                              }
                            />
                          </div>
                        </>
                      ) : null}
                      {selectedNode.data.workflowType === "code.execute" ? (
                        <>
                          <div className="flex flex-col gap-2">
                            <Label>{t("language")}</Label>
                            <Select
                              value={String(
                                selectedNode.data.parameters.language ?? "node",
                              )}
                              onValueChange={(value) =>
                                updateParameters({ language: value })
                              }
                            >
                              <SelectTrigger aria-label={t("language")}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="node">JavaScript</SelectItem>
                                <SelectItem value="python">Python</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex flex-col gap-2">
                            <Label htmlFor="workflow-code">{t("code")}</Label>
                            <Textarea
                              id="workflow-code"
                              value={String(
                                selectedNode.data.parameters.code ?? "",
                              )}
                              onChange={(event) =>
                                updateParameters({ code: event.target.value })
                              }
                              className="min-h-64 font-mono text-xs"
                              spellCheck={false}
                            />
                          </div>
                        </>
                      ) : null}
                      <div className="flex flex-col gap-2">
                        <Label>{t("parameters")}</Label>
                        <JsonEditor
                          key={`${selectedNode.id}:${JSON.stringify(selectedNode.data.parameters)}`}
                          value={selectedNode.data.parameters}
                          onChange={(parameters) =>
                            updateSelectedNode({ parameters })
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          {t("parametersHint")}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2 flex flex-col gap-2">
                          <Label htmlFor="workflow-timeout">
                            {t("timeout")}
                          </Label>
                          <Input
                            id="workflow-timeout"
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
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="workflow-retries">
                            {t("retries")}
                          </Label>
                          <Input
                            id="workflow-retries"
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
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="workflow-retry-delay">
                            {t("retryDelay")}
                          </Label>
                          <Input
                            id="workflow-retry-delay"
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
                        </div>
                      </div>
                      {selectedNode.data.workflowType !== "trigger.manual" ? (
                        <Button
                          variant="destructive"
                          onClick={removeSelectedNode}
                        >
                          <Trash2Icon data-icon="inline-start" />
                          {t("deleteNode")}
                        </Button>
                      ) : null}
                    </>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border p-4 text-sm leading-6 text-muted-foreground">
                      {t("noSelection")}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
            <TabsContent value="runs" className="min-h-0">
              <ScrollArea className="h-[calc(100dvh-15rem)]">
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
                  {runs.length === 0 ? (
                    <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                      {t("noRuns")}
                    </p>
                  ) : (
                    runs.map((run) => (
                      <div
                        key={run.id}
                        className="rounded-xl border border-border/75 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {run.id.slice(0, 8)}
                          </span>
                          <Badge
                            variant={
                              run.status === "failed"
                                ? "destructive"
                                : run.status === "completed"
                                  ? "default"
                                  : "secondary"
                            }
                          >
                            {run.status === "completed" ? (
                              <CheckIcon aria-hidden="true" />
                            ) : null}
                            {t(`status.${run.status}`)}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {new Date(run.queuedAt).toLocaleString()}
                        </p>
                        {run.error ? (
                          <p className="mt-2 line-clamp-3 text-xs text-destructive">
                            {run.error}
                          </p>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      <Sheet open={runSheetOpen} onOpenChange={setRunSheetOpen}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{t("runTitle")}</SheetTitle>
            <p className="text-sm leading-6 text-muted-foreground">
              {t("runDescription")}
            </p>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-4 px-5 pb-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="workflow-run-input">{t("runInput")}</Label>
              <Textarea
                id="workflow-run-input"
                value={runInput}
                onChange={(event) => setRunInput(event.target.value)}
                className="min-h-72 font-mono text-xs"
                spellCheck={false}
              />
            </div>
            <Button
              onClick={() => void runWorkflow()}
              disabled={running}
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
    </div>
  );
}
