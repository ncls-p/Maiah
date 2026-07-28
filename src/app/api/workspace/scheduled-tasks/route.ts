import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import {
  hasResourcePermissionForRequest,
  isWorkspaceMemberForRequest,
} from "@/modules/auth/workspace-access";
import {
  createScheduledTask,
  listScheduledTasks,
} from "@/modules/scheduled-tasks/use-cases";
import { listDirectlyBoundResourceIds } from "@/server/infrastructure/db/access-resource-repository";

const querySchema = z.object({ workspaceId: z.uuid() });

const createSchema = z.object({
  workspaceId: z.uuid(),
  agentId: z.uuid(),
  conversationId: z.uuid().nullable().optional(),
  title: z.string().trim().min(1).max(255),
  prompt: z.string().trim().min(1).max(8_000),
  frequency: z.enum(["daily", "interval"]),
  timezone: z.string().trim().min(1).max(64).optional(),
  timeOfDay: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  intervalMinutes: z.number().int().min(5).max(43_200).nullable().optional(),
  enabled: z.boolean().optional(),
});

async function requireChatPermission(userId: string, workspaceId: string) {
  const forbidden = await requireWorkspacePermissionAsync(
    userId,
    workspaceId,
    "agents.chat",
  );
  return forbidden === null;
}

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = querySchema.safeParse({
        workspaceId: req.nextUrl.searchParams.get("workspaceId"),
      });
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid input" }, { status: 400 });
      }
      if (
        !(await isWorkspaceMemberForRequest(
          session.user.id,
          parsed.data.workspaceId,
        ))
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const directlyBoundIds = await listDirectlyBoundResourceIds(
        session.user.id,
        "scheduled_task",
      );
      const directlyAccessibleIds = (
        await Promise.all(
          directlyBoundIds.map(async (taskId) => ({
            taskId,
            granted: await hasResourcePermissionForRequest(
              session.user.id,
              parsed.data.workspaceId,
              "agents.chat",
              "scheduled_task",
              taskId,
            ),
          })),
        )
      )
        .filter(({ granted }) => granted)
        .map(({ taskId }) => taskId);
      return NextResponse.json({
        tasks: await listScheduledTasks(
          parsed.data.workspaceId,
          session.user.id,
          directlyAccessibleIds,
        ),
      });
    },
    { logLabel: "Failed to list scheduled tasks" },
  );
}

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = createSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      }
      if (
        !(await requireChatPermission(session.user.id, parsed.data.workspaceId))
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const task = await createScheduledTask({
        ...parsed.data,
        userId: session.user.id,
      });
      return NextResponse.json({ task }, { status: 201 });
    },
    { logLabel: "Failed to create scheduled task" },
  );
}
