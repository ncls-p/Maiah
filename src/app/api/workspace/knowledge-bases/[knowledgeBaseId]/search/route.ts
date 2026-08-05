import {
handleRoute,
requireResourcePermissionAsync,
} from "@/lib/route-handler";
import { searchKnowledgeBase } from "@/modules/knowledge/use-cases";
import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";

const searchSchema = z.object({
  workspaceId: z.uuid(),
  query: z.string().min(1).max(512),
  limit: z.number().int().min(1).max(20).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ knowledgeBaseId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = searchSchema.safeParse(await req.json());
      if (!parsed.success)
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
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
      return NextResponse.json(
        await searchKnowledgeBase({
          knowledgeBaseId,
          userId: session.user.id,
          ...parsed.data,
        }),
      );
    },
    {
      logLabel: "Failed to search knowledge base",
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
