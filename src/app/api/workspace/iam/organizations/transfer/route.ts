import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";

import { handleRoute } from "@/lib/route-handler";
import { executeOrganizationClone,executeOrganizationTransfer,listOrganizationTransferDestinations,previewOrganizationClone,previewOrganizationTransfer } from "@/modules/iam/organization-transfer";
import { TRANSFER_SECRET_POLICIES } from "@/modules/iam/resource-transfer";
import { expectedIamError } from "../../transfer-route-support";

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("preview"),
    mode: z.enum(["move", "clone"]),
    sourceWorkspaceId: z.uuid(),
    targetOrganizationId: z.uuid(),
    secretPolicy: z.enum(TRANSFER_SECRET_POLICIES),
  }),
  z.object({
    action: z.literal("execute"),
    mode: z.enum(["move", "clone"]),
    sourceWorkspaceId: z.uuid(),
    targetOrganizationId: z.uuid(),
    secretPolicy: z.enum(TRANSFER_SECRET_POLICIES),
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
        destinations: await listOrganizationTransferDestinations({
          actorUserId: session.user.id,
          sourceWorkspaceId: parsed.data.sourceWorkspaceId,
        }),
      });
    },
    {
      allowApiKey: false,
      logLabel: "Failed to list organization migration destinations",
      expectedError: expectedIamError,
    },
  );
}

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = requestSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid organization migration request" }, { status: 400 });
      }
      const common = {
        actorUserId: session.user.id,
        sourceWorkspaceId: parsed.data.sourceWorkspaceId,
        targetOrganizationId: parsed.data.targetOrganizationId,
      };
      if (parsed.data.action === "preview") {
        return NextResponse.json(
          parsed.data.mode === "clone"
            ? await previewOrganizationClone({
                ...common,
                secretPolicy: parsed.data.secretPolicy,
              })
            : await previewOrganizationTransfer(common),
        );
      }
      return NextResponse.json(
        parsed.data.mode === "clone"
          ? await executeOrganizationClone({
              ...common,
              secretPolicy: parsed.data.secretPolicy,
              confirmationToken: parsed.data.confirmationToken,
            })
          : await executeOrganizationTransfer({
              ...common,
              confirmationToken: parsed.data.confirmationToken,
            }),
      );
    },
    {
      allowApiKey: false,
      logLabel: "Failed to migrate organization",
      expectedError: expectedIamError,
    },
  );
}
