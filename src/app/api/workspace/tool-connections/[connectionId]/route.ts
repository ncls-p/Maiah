import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import {
  archiveToolConnection,
  toSafeToolConnection,
  updateToolConnection,
} from "@/modules/tool-connections/use-cases";

const jsonRecordSchema = z.record(z.string(), z.unknown());
const secretRecordSchema = z.record(z.string(), z.string());
const updateSchema = z.object({
  workspaceId: z.uuid(),
  label: z.string().min(1).max(255).optional(),
  config: jsonRecordSchema.nullable().optional(),
  secrets: secretRecordSchema.nullable().optional(),
  isDefault: z.boolean().optional(),
  status: z.enum(["active", "invalid", "expired", "disabled"]).optional(),
});
const deleteSchema = z.object({ workspaceId: z.uuid() });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = updateSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      }

      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "tools.configure",
      );
      if (forbidden) return forbidden;

      const { connectionId } = await params;
      const canManageWorkspaceConnections = await canManageTenantGlobals(
        session,
        parsed.data.workspaceId,
      );
      const connection = await updateToolConnection({
        connectionId,
        userId: session.user.id,
        canManageWorkspaceConnections,
        ...parsed.data,
      });
      return NextResponse.json(toSafeToolConnection(connection));
    },
    {
      logLabel: "Failed to update tool connection",
      expectedError: (error) => {
        const msg =
          error instanceof Error ? error.message : "Internal server error";
        const status = msg.includes("not found")
          ? 404
          : msg.includes("Not allowed")
            ? 403
            : 500;
        return NextResponse.json({ error: msg }, { status });
      },
    },
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = deleteSchema.safeParse({
        workspaceId: req.nextUrl.searchParams.get("workspaceId"),
      });
      if (!parsed.success) {
        return NextResponse.json(
          { error: "workspaceId must be a valid UUID" },
          { status: 400 },
        );
      }

      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "tools.configure",
      );
      if (forbidden) return forbidden;

      const { connectionId } = await params;
      const canManageWorkspaceConnections = await canManageTenantGlobals(
        session,
        parsed.data.workspaceId,
      );
      return NextResponse.json(
        await archiveToolConnection(
          connectionId,
          parsed.data.workspaceId,
          session.user.id,
          canManageWorkspaceConnections,
        ),
      );
    },
    {
      logLabel: "Failed to archive tool connection",
      expectedError: (error) => {
        const msg =
          error instanceof Error ? error.message : "Internal server error";
        const status = msg.includes("not found")
          ? 404
          : msg.includes("Not allowed")
            ? 403
            : 500;
        return NextResponse.json({ error: msg }, { status });
      },
    },
  );
}
