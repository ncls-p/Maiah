import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";

import { handleRoute } from "@/lib/route-handler";
import { executeMemberTransfer,listMemberTransferDestinations,MEMBER_TRANSFER_MODES,previewMemberTransfer } from "@/modules/iam/member-transfer";
import { expectedIamError } from "../../transfer-route-support";

const transferSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("preview"),
    sourceWorkspaceId: z.uuid(),
    targetWorkspaceId: z.uuid(),
    userIds: z.array(z.uuid()).min(1).max(100),
    roleId: z.uuid(),
    mode: z.enum(MEMBER_TRANSFER_MODES),
  }),
  z.object({
    action: z.literal("execute"),
    sourceWorkspaceId: z.uuid(),
    targetWorkspaceId: z.uuid(),
    userIds: z.array(z.uuid()).min(1).max(100),
    roleId: z.uuid(),
    mode: z.enum(MEMBER_TRANSFER_MODES),
    confirmationToken: z.string().length(64),
  }),
]);

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = z.object({ sourceWorkspaceId: z.uuid() }).safeParse({
        sourceWorkspaceId: req.nextUrl.searchParams.get("sourceWorkspaceId"),
      });
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid source project" }, { status: 400 });
      }
      return NextResponse.json({
        destinations: await listMemberTransferDestinations({
          userId: session.user.id,
          sourceWorkspaceId: parsed.data.sourceWorkspaceId,
        }),
      });
    },
    {
      allowApiKey: false,
      logLabel: "Failed to list member transfer destinations",
      expectedError: expectedIamError,
    },
  );
}

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = transferSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid member transfer", details: parsed.error.issues }, { status: 400 });
      }
      if (parsed.data.action === "preview") {
        return NextResponse.json(
          await previewMemberTransfer({
            actorUserId: session.user.id,
            ...parsed.data,
          }),
        );
      }
      return NextResponse.json(
        await executeMemberTransfer({
          actorUserId: session.user.id,
          ...parsed.data,
        }),
      );
    },
    {
      allowApiKey: false,
      logLabel: "Failed to transfer members",
      expectedError: expectedIamError,
    },
  );
}
