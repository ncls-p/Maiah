import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { getBuiltInTool } from "@/modules/tool/builtin-tools";
import { rejectPendingToolInvocation } from "@/modules/tool/invocation-approval";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
  conversations,
  toolInvocations,
} from "@/server/infrastructure/db/schema";
import { invocationParamsSchema } from "../../invocation-shared";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ invocationId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = invocationParamsSchema.safeParse(await params);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const [row] = await db
        .select({ invocation: toolInvocations, conversation: conversations })
        .from(toolInvocations)
        .innerJoin(
          conversations,
          eq(toolInvocations.conversationId, conversations.id),
        )
        .where(
          and(
            eq(toolInvocations.id, parsed.data.invocationId),
            eq(conversations.userId, session.user.id),
          ),
        )
        .limit(1);
      const invocation = row?.invocation;
      if (!invocation) {
        return NextResponse.json(
          { error: "Invocation not found" },
          { status: 404 },
        );
      }
      const rejectionPermission =
        invocation.toolSource === "builtin" &&
        getBuiltInTool(invocation.toolId)?.name ===
          "github_publish_code_workspace"
          ? "agents.chat"
          : "tools.executeRestricted";
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        invocation.workspaceId,
        rejectionPermission,
      );
      if (forbidden) return forbidden;
      const transition = await rejectPendingToolInvocation(
        invocation.id,
        session.user.id,
      );
      if (transition.kind === "missing") {
        return NextResponse.json(
          { error: "Invocation not found" },
          { status: 404 },
        );
      }
      if (transition.kind === "unchanged") {
        if (transition.invocation.status === "rejected") {
          return NextResponse.json({
            ok: true,
            status: "rejected",
            alreadyResolved: true,
          });
        }
        return NextResponse.json(
          {
            error: `Invocation can no longer be rejected (status: ${transition.invocation.status})`,
          },
          { status: 409 },
        );
      }
      await audit.emit({
        workspaceId: invocation.workspaceId,
        actorPrincipalType: "user",
        actorPrincipalId: session.user.id,
        action: "toolInvocation.rejected",
        resourceType: "tool_invocation",
        resourceId: invocation.id,
        outcome: "success",
        metadata: {
          toolName: invocation.toolName,
          toolSource: invocation.toolSource,
        },
      });
      return NextResponse.json({ ok: true, status: "rejected" });
    },
    { logLabel: "Failed to reject tool invocation" },
  );
}
