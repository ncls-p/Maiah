import {
  handleRoute,
  requireResourcePermissionAsync,
} from "@/lib/route-handler";
import { listDocuments } from "@/modules/knowledge/use-cases";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({
  workspaceId: z.uuid(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  status: z.enum(["ready", "processing", "failed"]).optional(),
  q: z.string().max(512).optional(),
});
export const createSchema = z.object({
  workspaceId: z.uuid(),
  title: z.string().min(1).max(512),
  content: z.string().min(1).max(2_000_000),
  sourceType: z.enum(["text", "url"]).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ knowledgeBaseId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const searchParams = req.nextUrl.searchParams;
      const parsed = querySchema.safeParse({
        workspaceId: searchParams.get("workspaceId"),
        limit: searchParams.get("limit") ?? undefined,
        offset: searchParams.get("offset") ?? undefined,
        status: searchParams.get("status") ?? undefined,
        q: searchParams.get("q") ?? undefined,
      });
      if (!parsed.success)
        return NextResponse.json(
          { error: "Invalid document list query" },
          { status: 400 },
        );
      const forbidden = await requireResourcePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "knowledgeBases.viewAllowed",
        "knowledge_base",
        (await params).knowledgeBaseId,
      );
      if (forbidden) return forbidden;
      const { knowledgeBaseId } = await params;
      const { workspaceId, limit, offset, status, q } = parsed.data;
      if (limit !== undefined) {
        return NextResponse.json(
          await listDocuments(knowledgeBaseId, workspaceId, session.user.id, {
            limit,
            offset: offset ?? 0,
            status,
            search: q,
          }),
        );
      }
      return NextResponse.json(
        await listDocuments(knowledgeBaseId, workspaceId, session.user.id),
      );
    },
    {
      logLabel: "Failed to list documents",
      expectedError: (error) => {
        const msg =
          error instanceof Error ? error.message : "Internal server error";
        const status =
          error instanceof Error && error.message.includes("not found")
            ? 404
            : 500;
        return NextResponse.json({ error: msg }, { status });
      },
    },
  );
}
