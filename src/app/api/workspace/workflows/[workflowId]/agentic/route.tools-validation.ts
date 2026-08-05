import { tool } from "ai";
import { z } from "zod";

import { WorkflowAgenticState } from "./route.agentic-state";
import { createWorkflowBaseTools } from "./route.tools-base";
import { createWorkflowEditTools } from "./route.tools-edit";

export function createWorkflowValidationTools(state: WorkflowAgenticState, latestVersion: number) {
  return {
    validate_workflow: tool({
      description: "Validate the current workflow graph after all requested changes.",
      inputSchema: z.object({}),
      execute: async () => {
        state.requirePlan();
        state.reserveAction();
        state.draft = { ...state.draft, definition: state.validateDefinition(state.draft.definition) };
        state.workflowValidated = true;
        state.dryRunCompleted = false;
        return { ok: true, revision: state.revision, nodeCount: state.draft.definition.nodes.length, edgeCount: state.draft.definition.edges.length };
      },
    }),
    dry_run_workflow: tool({
      description: "Perform a non-executing dry run of the current draft: validate configuration and return the planned node/connection path without external side effects.",
      inputSchema: z.object({ testInput: z.unknown().optional() }),
      execute: async ({ testInput }) => {
        state.requirePlan();
        state.draft = { ...state.draft, definition: state.validateDefinition(state.draft.definition) };
        state.workflowValidated = true;
        state.dryRunCompleted = true;
        return {
          ok: true,
          mode: "non-executing",
          revision: state.revision,
          testInput,
          nodes: state.draft.definition.nodes.map(({ id, type, label }) => ({ id, type, label })),
          connections: state.draft.definition.edges.map(({ source, sourceHandle, target }) => ({ source, sourceHandle, target })),
          note: "No workflow node or external side effect was executed.",
        };
      },
    }),
    request_workflow_run: tool({
      description: "Create a human approval request for one real execution of the exact tested workflow version. This never starts the run by itself.",
      inputSchema: z.object({ title: z.string().trim().min(1).max(255), reason: z.string().trim().min(1).max(1_000).optional(), input: z.unknown().optional() }),
      execute: async ({ title, reason, input }) => {
        state.requirePlan();
        if (!state.workflowValidated || !state.dryRunCompleted) throw new Error("Validate and dry-run the workflow before requesting execution.");
        if (state.runRequestCreated) throw new Error("Only one workflow execution request is allowed per turn.");
        state.runRequestCreated = true;
        state.pendingRunRequest = { title, reason, payload: input, expectedVersion: latestVersion + (state.revision > 0 ? 1 : 0) };
        return { ok: true, approvalRequired: true, expectedVersion: state.pendingRunRequest.expectedVersion, note: "The request will be shown to the user after the tested workflow version is saved." };
      },
    }),
  };
}

export function createWorkflowAgentTools(context: { state: WorkflowAgenticState; workflowId: string; workspaceId: string; userId: string; latestVersion: number }) {
  return { ...createWorkflowBaseTools(context), ...createWorkflowEditTools(context.state), ...createWorkflowValidationTools(context.state, context.latestVersion) };
}
