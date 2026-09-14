import type { NodeFunction } from "flowcraft";
import { z } from "zod";
import {
  nodeAbortSignal,
  resolveTemplates,
  writePath,
  type RuntimeContext,
  type WorkflowRuntimeDependencies,
} from "./runtime.workflow-runtime-dependencies";
export const nestedWorkflowParametersSchema = z.object({
  workflowId: z.uuid(),
  input: z.unknown().optional(),
  outputPath: z.string().trim().min(1).default("workflowResult"),
});
export const runNestedWorkflow: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies
> = async ({ input, params, dependencies, signal }) => {
  const parsed = nestedWorkflowParametersSchema.parse(params);
  const { executeNestedWorkflow } = await import("./nested-execution");
  const result = await executeNestedWorkflow({
    ...dependencies,
    targetWorkflowId: parsed.workflowId,
    input: resolveTemplates(parsed.input ?? "{{input}}", input),
    signal: nodeAbortSignal(signal, params.__timeoutMs),
    nodeId: String(params.__nodeId),
  });
  return { output: writePath(input, parsed.outputPath, result) };
};
