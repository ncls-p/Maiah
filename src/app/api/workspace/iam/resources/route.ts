import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";

import { handleRoute } from "@/lib/route-handler";
import { deleteProjectAccessResource } from "@/modules/iam/resource-deletion";
import { getResourceAccessSnapshot,IamOperationError,listProjectAccessResources } from "@/modules/iam/use-cases";
import { ACCESS_RESOURCE_TYPES } from "@/server/domain/entities/access-resource";

const querySchema = z.object({
  workspaceId: z.uuid(),
  resourceType: z.enum(ACCESS_RESOURCE_TYPES),
  resourceId: z.uuid().optional(),
  search: z.string().trim().max(255).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

function expectedIamError(error: unknown) {
  if (error instanceof IamOperationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
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
        resourceId: req.nextUrl.searchParams.get("resourceId") || undefined,
        search: req.nextUrl.searchParams.get("search") || undefined,
        offset: req.nextUrl.searchParams.get("offset") ?? undefined,
        limit: req.nextUrl.searchParams.get("limit") ?? undefined,
      });
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid resource query", details: parsed.error.issues }, { status: 400 });
      }

      if (parsed.data.resourceId) {
        const snapshot = await getResourceAccessSnapshot({
          userId: session.user.id,
          workspaceId: parsed.data.workspaceId,
          resourceType: parsed.data.resourceType,
          resourceId: parsed.data.resourceId,
        });
        return NextResponse.json(snapshot);
      }

      const result = await listProjectAccessResources({
        userId: session.user.id,
        workspaceId: parsed.data.workspaceId,
        resourceType: parsed.data.resourceType,
        search: parsed.data.search,
        offset: parsed.data.offset,
        limit: parsed.data.limit,
      });
      return NextResponse.json(result);
    },
    {
      allowApiKey: false,
      logLabel: "Failed to load resource access",
      expectedError: expectedIamError,
    },
  );
}

export async function DELETE(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = querySchema
        .pick({
          workspaceId: true,
          resourceType: true,
          resourceId: true,
        })
        .required({ resourceId: true })
        .safeParse({
          workspaceId: req.nextUrl.searchParams.get("workspaceId"),
          resourceType: req.nextUrl.searchParams.get("resourceType"),
          resourceId: req.nextUrl.searchParams.get("resourceId"),
        });
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid resource deletion request" }, { status: 400 });
      }
      return NextResponse.json(
        await deleteProjectAccessResource({
          actorUserId: session.user.id,
          ...parsed.data,
        }),
      );
    },
    {
      allowApiKey: false,
      logLabel: "Failed to delete project resource",
      expectedError: expectedIamError,
    },
  );
}
