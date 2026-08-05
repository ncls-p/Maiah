"use client";

import {
MarkerType,
type Edge
} from "@xyflow/react";

import type {
WorkflowDefinition
} from "@/modules/workflows/contracts";

import type { WorkflowRun } from "./types";
import {
WorkflowCanvasNode,
type WorkflowCanvasNodeType
} from "./workflow-canvas-node";

export const nodeTypes = { workflow: WorkflowCanvasNode };

export type AgentOption = { id: string; name: string };

export function canvasNodes(definition: WorkflowDefinition): WorkflowCanvasNodeType[] {
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

export function canvasEdges(definition: WorkflowDefinition): Edge[] {
  return definition.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? undefined,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { strokeWidth: 1.6 },
  }));
}

export function workflowDefinition(
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

export function runBadgeVariant(run: WorkflowRun) {
  if (run.status === "failed") return "destructive" as const;
  if (run.status === "completed") return "default" as const;
  return "secondary" as const;
}
