import { resolveWorkflowSecretReferences } from "./agentic-history";
import type { NodeFunction } from "flowcraft";
import {
  nodeAbortSignal,
  resolveTemplates,
  writePath,
  type RuntimeContext,
  type WorkflowRuntimeDependencies,
} from "./runtime.workflow-runtime-dependencies";

export const runTool: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies
> = async ({ input, params, dependencies, signal }) => {
  const { executeWorkflowTool } = await import("./execute-tool");
  const result = await executeWorkflowTool({
    workspaceId: dependencies.workspaceId,
    userId: dependencies.userId,
    parameters: {
      ...params,
      arguments: await resolveWorkflowSecretReferences(
        resolveTemplates(params.arguments ?? {}, input),
        {
          workflowId: dependencies.workflowId,
          workspaceId: dependencies.workspaceId,
        },
      ),
    },
    signal: nodeAbortSignal(signal, params.__timeoutMs),
  });
  return {
    output: writePath(input, String(params.outputPath ?? "toolResult"), result),
  };
};
