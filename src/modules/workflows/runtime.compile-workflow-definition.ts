import { FlowRuntime,lintBlueprint,type FlowcraftEvent,type IEventBus,type NodeFunction,type WorkflowBlueprint } from "flowcraft";

import { workflowDefinitionSchema,type WorkflowDefinition,type WorkflowNode } from "./contracts";
import { WORKFLOW_NODE_REGISTRY,assertNodeParameters,hasCycle } from "./runtime.workflow-node-registry";
import { RuntimeContext,WorkflowRuntimeDependencies } from "./runtime.workflow-runtime-dependencies";

export function compileWorkflowDefinition(input: { workflowId: string; version: number; definition: unknown }): {
  definition: WorkflowDefinition;
  blueprint: WorkflowBlueprint;
} {
  const definition = workflowDefinitionSchema.parse(input.definition);
  for (const node of definition.nodes) assertNodeParameters(node);
  if (hasCycle(definition)) {
    throw new Error("Workflow cycles are not supported yet.");
  }
  const blueprint: WorkflowBlueprint = {
    id: `${input.workflowId}@${input.version}`,
    metadata: { version: String(input.version), schemaVersion: 1 },
    nodes: definition.nodes.map((node) => ({
      id: node.id,
      uses: node.type,
      params: {
        ...node.parameters,
        __nodeId: node.id,
        __timeoutMs: node.settings.timeoutMs,
      },
      config: {
        timeout: node.settings.timeoutMs,
        // Flowcraft names this field maxRetries but interprets it as the total
        // number of attempts. Maiah's DSL exposes the less surprising number
        // of additional retries.
        maxRetries: node.settings.maxRetries + 1,
        retryDelay: node.settings.retryDelayMs,
      },
    })),
    edges: definition.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      action: edge.sourceHandle ?? undefined,
    })),
  };
  const registry = WORKFLOW_NODE_REGISTRY as unknown as Record<string, NodeFunction>;
  const lint = lintBlueprint(blueprint, registry);
  if (!lint.isValid) {
    throw new Error(lint.issues.map((issue) => issue.message).join(" "));
  }
  return { definition, blueprint };
}

export function createWorkflowRuntime(input: { dependencies: WorkflowRuntimeDependencies; eventBus?: IEventBus }) {
  return new FlowRuntime<RuntimeContext, WorkflowRuntimeDependencies>({
    registry: WORKFLOW_NODE_REGISTRY as unknown as Record<string, NodeFunction>,
    dependencies: input.dependencies,
    eventBus: input.eventBus,
    strict: true,
  });
}

export function createWorkflowEventBus(emit: (event: FlowcraftEvent) => void | Promise<void>): IEventBus {
  return { emit };
}

export function workflowNodeById(definition: WorkflowDefinition, nodeId: string): WorkflowNode | undefined {
  return definition.nodes.find((node) => node.id === nodeId);
}
