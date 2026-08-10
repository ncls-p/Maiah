import {
  handleRoute,
  requireResourcePermissionAsync,
} from "@/lib/route-handler";
import {
  deleteScheduledTask,
  updateScheduledTask,
} from "@/modules/scheduled-tasks/use-cases";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const paramsSchema = z.object({ taskId: z.uuid() });
const workspaceQuerySchema = z.object({ workspaceId: z.uuid() });
const updateSchema = z.object({
  workspaceId: z.uuid(),
  agentId: z.uuid().optional(),
  conversationId: z.uuid().nullable().optional(),
  title: z.string().trim().min(1).max(255).optional(),
  prompt: z.string().trim().min(1).max(8_000).optional(),
  frequency: z.enum(["daily", "interval"]).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  timeOfDay: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  intervalMinutes: z.number().int().min(5).max(43_200).nullable().optional(),
  enabled: z.boolean().optional(),
});

async function requireChatPermission(
  userId: string,
  workspaceId: string,
  taskId: string,
) {
  const forbidden = await requireResourcePermissionAsync(
    userId,
    workspaceId,
    "agents.chat",
    "scheduled_task",
    taskId,
  );
  return forbidden === null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = paramsSchema.safeParse(await params);
      const parsed = updateSchema.safeParse(await req.json());
      if (!parsedParams.success || !parsed.success) {
        return NextResponse.json({ error: "Invalid input" }, { status: 400 });
      }
      if (
        !(await requireChatPermission(
          session.user.id,
          parsed.data.workspaceId,
          parsedParams.data.taskId,
        ))
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const task = await updateScheduledTask(
        parsedParams.data.taskId,
        parsed.data.workspaceId,
        session.user.id,
        parsed.data,
        { allowShared: true },
      );
      return NextResponse.json({ task });
    },
    { logLabel: "Failed to update scheduled task" },
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = paramsSchema.safeParse(await params);
      const parsedQuery = workspaceQuerySchema.safeParse({
        workspaceId: req.nextUrl.searchParams.get("workspaceId"),
      });
      if (!parsedParams.success || !parsedQuery.success) {
        return NextResponse.json({ error: "Invalid input" }, { status: 400 });
      }
      if (
        !(await requireChatPermission(
          session.user.id,
          parsedQuery.data.workspaceId,
          parsedParams.data.taskId,
        ))
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      await deleteScheduledTask(
        parsedParams.data.taskId,
        parsedQuery.data.workspaceId,
        session.user.id,
        { allowShared: true },
      );
      return NextResponse.json({ ok: true });
    },
    { logLabel: "Failed to delete scheduled task" },
  );
}
