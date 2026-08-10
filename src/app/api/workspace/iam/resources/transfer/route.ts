import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { handleRoute } from "@/lib/route-handler";
import {
  executeResourceTransfer,
  listResourceTransferDestinations,
  previewResourceTransfer,
  RESOURCE_TRANSFER_ROOT_TYPES,
  TRANSFER_ACCESS_POLICIES,
  TRANSFER_OWNERSHIP_POLICIES,
  TRANSFER_SECRET_POLICIES,
} from "@/modules/iam/resource-transfer";
import {
  executeWorkspaceClone,
  previewWorkspaceClone,
} from "@/modules/iam/workspace-clone";
import { expectedIamError } from "../../transfer-route-support";

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
    resourceType: z.enum(RESOURCE_TRANSFER_ROOT_TYPES),
    resourceId: z.uuid(),
    mode: z.enum(["move", "clone"]).default("move"),
    options: optionsSchema,
  }),
  z.object({
    action: z.literal("execute"),
    sourceWorkspaceId: z.uuid(),
    targetWorkspaceId: z.uuid(),
    resourceType: z.enum(RESOURCE_TRANSFER_ROOT_TYPES),
    resourceId: z.uuid(),
    mode: z.enum(["move", "clone"]).default("move"),
    options: optionsSchema,
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
        if (
          parsed.data.mode === "clone" &&
          parsed.data.resourceType === "workspace"
        ) {
          return NextResponse.json(
            await previewWorkspaceClone({
              actorUserId: session.user.id,
              sourceWorkspaceId: parsed.data.sourceWorkspaceId,
              targetWorkspaceId: parsed.data.targetWorkspaceId,
              secretPolicy: parsed.data.options.secretPolicy,
            }),
          );
        }
        if (parsed.data.mode === "clone") {
          return NextResponse.json(
            { error: "Cloning is available for a complete project" },
            { status: 400 },
          );
        }
        return NextResponse.json(
          await previewResourceTransfer({
            actorUserId: session.user.id,
            ...parsed.data,
          }),
        );
      }
      if (
        parsed.data.mode === "clone" &&
        parsed.data.resourceType === "workspace"
      ) {
        return NextResponse.json(
          await executeWorkspaceClone({
            actorUserId: session.user.id,
            sourceWorkspaceId: parsed.data.sourceWorkspaceId,
            targetWorkspaceId: parsed.data.targetWorkspaceId,
            secretPolicy: parsed.data.options.secretPolicy,
            confirmationToken: parsed.data.confirmationToken,
          }),
        );
      }
      if (parsed.data.mode === "clone") {
        return NextResponse.json(
          { error: "Cloning is available for a complete project" },
          { status: 400 },
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
