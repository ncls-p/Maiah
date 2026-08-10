import {
  validateWorkflowAgentDraft,
  type WorkflowAgenticDraft,
} from "@/modules/workflows/agentic";
import { workflowDefinitionSchema } from "@/modules/workflows/contracts";

export type PendingWorkflowRunRequest = {
  title: string;
  reason?: string;
  payload?: unknown;
  expectedVersion: number;
};

export class WorkflowAgenticState {
  draft: WorkflowAgenticDraft;
  revision = 0;
  actionCount = 0;
  searchCount = 0;
  sandboxCount = 0;
  planCreated = false;
  workflowValidated = false;
  dryRunCompleted = false;
  runRequestCreated = false;
  pendingRunRequest?: PendingWorkflowRunRequest;

  constructor(
    draft: WorkflowAgenticDraft,
    private readonly workflowId: string,
    private readonly latestVersion: number,
    private readonly availableAgentIds: Set<string>,
  ) {
    this.draft = draft;
  }

  requirePlan() {
    if (!this.planCreated)
      throw new Error("Create the workflow plan before changing the workflow.");
  }

  markDraftChanged() {
    this.requirePlan();
    if (this.runRequestCreated)
      throw new Error("The workflow cannot change after an execution request.");
    this.workflowValidated = false;
    this.dryRunCompleted = false;
  }

  reserveAction() {
    this.actionCount += 1;
    if (this.actionCount > 8)
      throw new Error("The workflow editing action limit was reached.");
  }

  validateDefinition(definition: unknown) {
    return validateWorkflowAgentDraft({
      workflowId: this.workflowId,
      version: this.latestVersion + 1,
      definition,
      availableAgentIds: this.availableAgentIds,
    });
  }

  changeDraft(
    change: Partial<Pick<WorkflowAgenticDraft, "name" | "description">>,
  ) {
    this.markDraftChanged();
    this.reserveAction();
    this.draft = { ...this.draft, ...change };
    this.revision += 1;
  }

  replaceDefinition(definition: unknown) {
    this.markDraftChanged();
    this.reserveAction();
    this.draft = {
      ...this.draft,
      definition: this.validateDefinition(definition),
    };
    this.revision += 1;
  }

  setParsedDefinition(definition: unknown) {
    this.markDraftChanged();
    this.reserveAction();
    this.draft = {
      ...this.draft,
      definition: workflowDefinitionSchema.parse(definition),
    };
    this.revision += 1;
  }
}
