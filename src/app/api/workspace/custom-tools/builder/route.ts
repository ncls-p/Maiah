import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import { runCustomToolBuilder } from "@/modules/custom-tools/use-cases";

const messageSchema = z.object({
  workspaceId: z.uuid(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(32_000),
      }),
    )
    .min(1)
    .max(40),
  credentialRefs: z
    .array(
      z.object({
        requestId: z.uuid(),
        credentialRef: z.uuid(),
      }),
    )
    .max(20)
    .optional(),
  isGlobal: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = messageSchema.safeParse(await req.json());
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
      const canManageGlobal = await canManageTenantGlobals(
        session,
        parsed.data.workspaceId,
      );
      if (parsed.data.isGlobal && !canManageGlobal) {
        return NextResponse.json(
          { error: "Only admins can make custom tools global" },
          { status: 403 },
        );
      }
      return NextResponse.json(
        await runCustomToolBuilder({
          workspaceId: parsed.data.workspaceId,
          userId: session.user.id,
          messages: parsed.data.messages,
          credentialRefs: parsed.data.credentialRefs,
          isGlobal: parsed.data.isGlobal && canManageGlobal,
        }),
      );
    },
    {
      logLabel: "Custom tool builder failed",
      expectedError: (error) => {
        const message =
          error instanceof Error ? error.message : "Unable to run builder";
        return NextResponse.json({ error: message }, { status: 500 });
      },
    },
  );
}
