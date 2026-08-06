import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";

import { handleRoute,requireResourcePermissionAsync } from "@/lib/route-handler";
import { type WorkflowAgenticStreamEvent } from "@/modules/workflows/agentic";
import { getWorkflowAgentHistory } from "@/modules/workflows/agentic-history";
import { getPendingWorkflowAgentRunRequests } from "@/modules/workflows/agentic-run-approvals";
import { getWorkflowAgentTodoList } from "@/modules/workflows/agentic-todo-list";
import { getWorkflowDetail } from "@/modules/workflows/use-cases";

import { workflowErrorResponse } from "../../route-support";

export const paramsSchema = z.object({ workflowId: z.uuid() });
const encoder = new TextEncoder();

export function encodeEvent(event: WorkflowAgenticStreamEvent) {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

export function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "The workflow is invalid.";
  }
  if (error instanceof Error && ["The workflow editing action limit was reached.", "The manual trigger cannot be removed."].includes(error.message)) {
    return error.message;
  }
  return "The workflow assistant stopped before saving.";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ workflowId: string }> }) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = paramsSchema.safeParse(await params);
      const parsedWorkspaceId = z.uuid().safeParse(req.nextUrl.searchParams.get("workspaceId"));
      if (!parsedParams.success || !parsedWorkspaceId.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const forbidden = await requireResourcePermissionAsync(session.user.id, parsedWorkspaceId.data, "workflows.view", "workflow", (await params).workflowId);
      if (forbidden) return forbidden;
      await getWorkflowDetail(parsedParams.data.workflowId, parsedWorkspaceId.data);
      const [history, runRequests, todoList] = await Promise.all([
        getWorkflowAgentHistory({
          workflowId: parsedParams.data.workflowId,
          workspaceId: parsedWorkspaceId.data,
          userId: session.user.id,
        }),
        getPendingWorkflowAgentRunRequests({
          workflowId: parsedParams.data.workflowId,
          workspaceId: parsedWorkspaceId.data,
          userId: session.user.id,
        }),
        getWorkflowAgentTodoList({
          workflowId: parsedParams.data.workflowId,
          workspaceId: parsedWorkspaceId.data,
          userId: session.user.id,
        }),
      ]);
      return NextResponse.json({
        messages: history.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
        })),
        pendingRequests: history.pendingRequests,
        runRequests,
        todoList,
      });
    },
    {
      logLabel: "Failed to load workflow assistant history",
      expectedError: workflowErrorResponse,
    },
  );
}
