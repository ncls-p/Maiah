import { tool } from "ai";
import { z } from "zod";

import { chatTodoListInputSchema } from "@/modules/chat/todo-list";
import {
  codeSandboxInputSchema,
  searchWebWithSearxng,
  webSearchInputSchema,
} from "@/modules/tool/builtin-tool-primitives";
import { executeCodeSandbox } from "@/modules/tool/code-sandbox";
import {
  createWorkflowAgentInputRequest,
  workflowAgentInputFieldSchema,
} from "@/modules/workflows/agentic-history";
import { updateWorkflowAgentTodoList } from "@/modules/workflows/agentic-todo-list";

import { WorkflowAgenticState } from "./route.agentic-state";

type ToolContext = {
  state: WorkflowAgenticState;
  workflowId: string;
  workspaceId: string;
  userId: string;
};

export function createWorkflowBaseTools({
  state,
  workflowId,
  workspaceId,
  userId,
}: ToolContext) {
  return {
    web_search: tool({
      description:
        "Search the live web for current, external, or implementation information. Use this whenever the automatic research is insufficient and cite useful result URLs in the final Markdown response.",
      inputSchema: webSearchInputSchema,
      execute: async (input) => {
        state.searchCount += 1;
        if (state.searchCount > 3)
          throw new Error("The web search limit was reached.");
        return searchWebWithSearxng(input);
      },
    }),
    set_workflow_plan: tool({
      description:
        "Record the required implementation and verification plan before editing the workflow.",
      inputSchema: z.object({
        summary: z.string().trim().min(1).max(500),
        steps: z.array(z.string().trim().min(1).max(300)).min(2).max(10),
        tests: z.array(z.string().trim().min(1).max(300)).min(1).max(8),
      }),
      execute: async ({ summary, steps, tests }) => {
        state.planCreated = true;
        return { ok: true, summary, steps, tests };
      },
    }),
    update_todo_list: tool({
      description:
        "Create or replace the visible to-do list for this workflow task. Keep item IDs stable and update statuses after each milestone so the user sees live progress.",
      inputSchema: chatTodoListInputSchema,
      execute: async (todoList) => {
        state.requirePlan();
        return updateWorkflowAgentTodoList({
          workflowId,
          workspaceId,
          userId,
          todoList,
        });
      },
    }),
    run_code_sandbox: tool({
      description:
        "Run a small Python, Node.js, or Bash test in the isolated sandbox. Use synthetic data only; never include secrets, private URLs, opaque secret references, or customer data.",
      inputSchema: codeSandboxInputSchema,
      execute: async (input) => {
        state.sandboxCount += 1;
        if (state.sandboxCount > 4)
          throw new Error("The sandbox test limit was reached.");
        return executeCodeSandbox(input, { workspaceId, userId });
      },
    }),
    request_user_input: tool({
      description:
        "Request essential structured information from the user. Sensitive fields open masked inputs and return only opaque references; ordinary fields can be returned in clear text.",
      inputSchema: z.object({
        title: z.string().trim().min(1).max(255),
        description: z.string().trim().max(800).optional(),
        fields: z.array(workflowAgentInputFieldSchema).min(1).max(12),
      }),
      execute: async ({ title, description, fields }) =>
        createWorkflowAgentInputRequest({
          workflowId,
          workspaceId,
          userId,
          title,
          description,
          fields,
        }),
    }),
  };
}
