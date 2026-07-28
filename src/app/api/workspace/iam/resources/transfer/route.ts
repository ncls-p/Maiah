import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { handleRoute } from "@/lib/route-handler";
import {
  executeResourceTransfer,
  listResourceTransferDestinations,
  previewResourceTransfer,
  TRANSFER_ACCESS_POLICIES,
  TRANSFER_OWNERSHIP_POLICIES,
  TRANSFER_SECRET_POLICIES,
} from "@/modules/iam/resource-transfer";
import { IamOperationError } from "@/modules/iam/use-cases";
import { ACCESS_RESOURCE_TYPES } from "@/server/domain/entities/access-resource";

const optionsSchema = z.object({
  includeDependencies: z.boolean(),
  accessPolicy: z.enum(TRANSFER_ACCESS_POLICIES),
  ownershipPolicy: z.enum(TRANSFER_OWNERSHIP_POLICIES),
  secretPolicy: z.enum(TRANSFER_SECRET_POLICIES),
});

const transferSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("preview"),
    sourceWorkspaceId: z.uuid(),
    targetWorkspaceId: z.uuid(),
    resourceType: z.enum(ACCESS_RESOURCE_TYPES),
    resourceId: z.uuid(),
    options: optionsSchema,
  }),
  z.object({
    action: z.literal("execute"),
    sourceWorkspaceId: z.uuid(),
    targetWorkspaceId: z.uuid(),
    resourceType: z.enum(ACCESS_RESOURCE_TYPES),
    resourceId: z.uuid(),
    options: optionsSchema,
    confirmationToken: z.string().length(64),
  }),
]);

function expectedIamError(error: unknown) {
  if (error instanceof IamOperationError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
  return null;
}

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = z.object({ sourceWorkspaceId: z.uuid() }).safeParse({
        sourceWorkspaceId: req.nextUrl.searchParams.get("sourceWorkspaceId"),
      });
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid source project" },
          { status: 400 },
        );
      }
      return NextResponse.json({
        destinations: await listResourceTransferDestinations({
          userId: session.user.id,
          sourceWorkspaceId: parsed.data.sourceWorkspaceId,
        }),
      });
    },
    {
      allowApiKey: false,
      logLabel: "Failed to list resource transfer destinations",
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
        return NextResponse.json(
          { error: "Invalid transfer request", details: parsed.error.issues },
          { status: 400 },
        );
      }
      if (parsed.data.action === "preview") {
        return NextResponse.json(
          await previewResourceTransfer({
            actorUserId: session.user.id,
            ...parsed.data,
          }),
        );
      }
      return NextResponse.json(
        await executeResourceTransfer({
          actorUserId: session.user.id,
          ...parsed.data,
        }),
      );
    },
    {
      allowApiKey: false,
      logLabel: "Failed to transfer resource",
      expectedError: expectedIamError,
    },
  );
}
