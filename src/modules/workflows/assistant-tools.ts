import { z } from "zod";
import {
  checkRequestPermissionScope,
  hasResourcePermissionForRequest,
  hasWorkspacePermissionForRequest,
  isWorkspaceMemberForRequest,
} from "@/modules/auth/workspace-access";
import type {
  BuiltInToolDefinition,
  BuiltInToolExecutionContext,
} from "@/modules/tool/builtin-tools.built-in-tool-execution-context";
import { workflowDefinitionSchema, type WorkflowDefinition } from "./contracts";
import {
  WORKFLOW_TOOL_SUMMARIES,
  workflowToolSchemas,
  type WorkflowToolName,
} from "./assistant-tool-contracts";

function requireContext(context?: BuiltInToolExecutionContext) {
  if (!context?.workspaceId || !context.userId)
    throw new Error("Workflow tools require user and workspace context");
  return context;
}

async function requirePermission(
  context: BuiltInToolExecutionContext,
  permission: string,
  workflowId?: string,
) {
  const allowed = workflowId
    ? await hasResourcePermissionForRequest(
        context.userId,
        context.workspaceId,
        permission,
        "workflow",
        workflowId,
      )
    : await hasWorkspacePermissionForRequest(
        context.userId,
        context.workspaceId,
        permission,
      );
  if (!allowed) throw new Error(`Missing permission: ${permission}`);
}

async function validateDefinition(
  context: BuiltInToolExecutionContext,
  definition: WorkflowDefinition,
  workflowId = crypto.randomUUID(),
) {
  const { listAgents } = await import("@/modules/agent/use-cases");
  const { validateWorkflowAgentDraft } = await import("./agentic");
  const agents = await listAgents(context.workspaceId, context.userId, false);
  return validateWorkflowAgentDraft({
    workflowId,
    version: 1,
    definition,
    availableAgentIds: new Set(agents.map((agent) => agent.id)),
  });
}

async function executeWorkflowTool(
  name: WorkflowToolName,
  raw: unknown,
  context: BuiltInToolExecutionContext,
) {
  const { listAgents } = await import("@/modules/agent/use-cases");
  const { workflowAgentCatalogPrompt } = await import("./agentic");
  const {
    createWorkflow,
    updateWorkflow,
    getWorkflowDetail,
    listWorkflows,
    publishWorkflow,
    createWorkflowRun,
    getWorkflowRun,
  } = await import("./use-cases");
  switch (name) {
    case "workflow_catalog": {
      workflowToolSchemas.workflow_catalog.parse(raw);
      if (
        !(await isWorkspaceMemberForRequest(
          context.userId,
          context.workspaceId,
        )) ||
        !checkRequestPermissionScope(
          context.userId,
          context.workspaceId,
          "workflows.view",
        ).granted
      ) {
        throw new Error("Missing permission: workflows.view");
      }
      const agents = await listAgents(
        context.workspaceId,
        context.userId,
        false,
      );
      const { listWorkflowTools } = await import("./tool-catalog");
      return {
        tools: await listWorkflowTools(context.workspaceId, context.userId),
        nodes: workflowAgentCatalogPrompt(),
        definitionSchema: z.toJSONSchema(workflowDefinitionSchema),
        assistants: agents.map(
          ({ id, name, description, activeVersionId }) => ({
            id,
            name,
            description,
            ready: Boolean(activeVersionId),
          }),
        ),
        instructions:
          "Use agent.run nodes to call assistants with their saved tools. Never store passwords in workflow definitions; use secret references. Publish before running. Background tool approval requirements must be configured in advance.",
      };
    }
    case "workflow_list": {
      const { query } = workflowToolSchemas.workflow_list.parse(raw);
      if (
        !(await isWorkspaceMemberForRequest(
          context.userId,
          context.workspaceId,
        )) ||
        !checkRequestPermissionScope(
          context.userId,
          context.workspaceId,
          "workflows.view",
        ).granted
      ) {
        throw new Error("Missing permission: workflows.view");
      }
      const workflows = await listWorkflows(context.workspaceId);
      const matches = workflows.filter((workflow) =>
        `${workflow.name} ${workflow.description ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      );
      const visible = await Promise.all(
        matches.map(async (workflow) =>
          (await hasResourcePermissionForRequest(
            context.userId,
            context.workspaceId,
            "workflows.view",
            "workflow",
            workflow.id,
          ))
            ? workflow
            : null,
        ),
      );
      return { workflows: visible.filter((workflow) => workflow !== null) };
    }
    case "workflow_get": {
      const { workflowId } = workflowToolSchemas.workflow_get.parse(raw);
      await requirePermission(context, "workflows.view", workflowId);
      return getWorkflowDetail(workflowId, context.workspaceId);
    }
    case "workflow_create": {
      const input = workflowToolSchemas.workflow_create.parse(raw);
      await requirePermission(context, "workflows.create");
      const definition = await validateDefinition(context, input.definition);
      return createWorkflow({
        ...input,
        definition,
        workspaceId: context.workspaceId,
        userId: context.userId,
      });
    }
    case "workflow_update": {
      const input = workflowToolSchemas.workflow_update.parse(raw);
      await requirePermission(context, "workflows.update", input.workflowId);
      const definition = await validateDefinition(
        context,
        input.definition,
        input.workflowId,
      );
      return updateWorkflow({
        ...input,
        definition,
        workspaceId: context.workspaceId,
        userId: context.userId,
      });
    }
    case "workflow_publish": {
      const { workflowId } = workflowToolSchemas.workflow_publish.parse(raw);
      await requirePermission(context, "workflows.update", workflowId);
      return publishWorkflow(workflowId, context.workspaceId);
    }
    case "workflow_run": {
      const input = workflowToolSchemas.workflow_run.parse(raw);
      await requirePermission(context, "workflows.execute", input.workflowId);
      return createWorkflowRun({
        workflowId: input.workflowId,
        payload: input.input,
        workspaceId: context.workspaceId,
        userId: context.userId,
        idempotencyKey: `assistant:${context.userId}:${input.idempotencyKey}`,
        trigger: "agent",
        useLatestDraft: false,
      });
    }
    case "workflow_run_status": {
      const { runId } = workflowToolSchemas.workflow_run_status.parse(raw);
      const run = await getWorkflowRun(runId, context.workspaceId);
      await requirePermission(context, "workflows.view", run.workflowId);
      return run;
    }
  }
}

export const workflowAssistantTools: BuiltInToolDefinition[] =
  WORKFLOW_TOOL_SUMMARIES.map((summary) => ({
    ...summary,
    inputSchema: workflowToolSchemas[summary.name],
    execute: (input, context) =>
      executeWorkflowTool(summary.name, input, requireContext(context)),
  }));
