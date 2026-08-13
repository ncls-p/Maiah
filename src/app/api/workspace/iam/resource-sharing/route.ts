import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { handleRoute } from "@/lib/route-handler";
import {
  getDirectResourceSharing,
  replaceDirectResourceSharing,
} from "@/modules/iam/resource-direct-sharing";
import { IamOperationError } from "@/modules/iam/use-cases";

const resourceTypeSchema = z.enum(["agent", "knowledge_base", "mcp_server"]);
const querySchema = z.object({
  workspaceId: z.uuid(),
  resourceType: resourceTypeSchema,
  resourceId: z.uuid(),
});
const shareSchema = z.object({
  userId: z.uuid(),
  access: z.enum(["view", "edit"]),
});
const mutationSchema = querySchema
  .extend({
    userIds: z.array(z.uuid()).max(100).optional(),
    shares: z.array(shareSchema).max(100).optional(),
    includeDependencies: z.boolean().optional(),
  })
  .refine((data) => data.userIds !== undefined || data.shares !== undefined, {
    message: "Either userIds or shares must be provided",
    path: ["userIds"],
  })
  .refine(
    (data) => (data.userIds?.length ?? 0) + (data.shares?.length ?? 0) <= 100,
    { message: "Too many share entries", path: ["shares"] },
  );

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
      const parsed = querySchema.safeParse({
        workspaceId: req.nextUrl.searchParams.get("workspaceId"),
        resourceType: req.nextUrl.searchParams.get("resourceType"),
        resourceId: req.nextUrl.searchParams.get("resourceId"),
      });
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid resource sharing query" },
          { status: 400 },
        );
      }
      return NextResponse.json(
        await getDirectResourceSharing({
          actorUserId: session.user.id,
          ...parsed.data,
        }),
      );
    },
    {
      allowApiKey: false,
      logLabel: "Failed to load resource sharing",
      expectedError: expectedIamError,
    },
  );
}

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = mutationSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: "Invalid resource sharing request",
            details: parsed.error.issues,
          },
          { status: 400 },
        );
      }
      return NextResponse.json(
        await replaceDirectResourceSharing({
          actorUserId: session.user.id,
          ...parsed.data,
        }),
      );
    },
    {
      allowApiKey: false,
      logLabel: "Failed to update resource sharing",
      expectedError: expectedIamError,
    },
  );
}
