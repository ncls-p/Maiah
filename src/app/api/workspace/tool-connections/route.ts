import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import {
  createToolConnection,
  listToolConnections,
  toSafeToolConnection,
} from "@/modules/tool-connections/use-cases";

const jsonRecordSchema = z.record(z.string(), z.unknown());
const secretRecordSchema = z.record(z.string(), z.string());
const querySchema = z.object({ workspaceId: z.uuid() });
const createSchema = z.object({
  workspaceId: z.uuid(),
  connectorId: z.uuid(),
  ownerType: z.enum(["user", "workspace"]).optional(),
  label: z.string().min(1).max(255),
  config: jsonRecordSchema.optional(),
  secrets: secretRecordSchema.optional(),
  isDefault: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = querySchema.safeParse({
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

      const canManageWorkspaceConnections = await canManageTenantGlobals(
        session,
        parsed.data.workspaceId,
      );
      return NextResponse.json(
        await listToolConnections(
          parsed.data.workspaceId,
          session.user.id,
          canManageWorkspaceConnections,
        ),
      );
    },
    { logLabel: "Failed to list tool connections" },
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

      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "tools.configure",
      );
      if (forbidden) return forbidden;

      const canManageWorkspaceConnections = await canManageTenantGlobals(
        session,
        parsed.data.workspaceId,
      );
      const connection = await createToolConnection({
        ...parsed.data,
        userId: session.user.id,
        canManageWorkspaceConnections,
      });
      return NextResponse.json(toSafeToolConnection(connection), {
        status: 201,
      });
    },
    {
      logLabel: "Failed to create tool connection",
      expectedError: (error) => {
        const msg =
          error instanceof Error ? error.message : "Internal server error";
        const status = msg.includes("not found")
          ? 404
          : msg.includes("Only admins")
            ? 403
            : 500;
        return NextResponse.json({ error: msg }, { status });
      },
    },
  );
}
