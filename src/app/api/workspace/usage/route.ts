import {
handleRoute,
requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { getWorkspaceUsageAnalytics } from "@/modules/usage/analytics";
import {
getWorkspaceMonthlyTokenLimit,
getWorkspaceMonthlyTokenUsage,
} from "@/modules/usage/quota";
import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({
  workspaceId: z.uuid(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  operation: z.string().max(64).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const { searchParams } = req.nextUrl;
      const parsed = querySchema.safeParse({
        workspaceId: searchParams.get("workspaceId"),
        limit: searchParams.get("limit") ?? undefined,
        operation: searchParams.get("operation") ?? undefined,
        from: searchParams.get("from") ?? undefined,
        to: searchParams.get("to") ?? undefined,
      });
      if (!parsed.success)
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );

      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "usage.view",
      );
      if (forbidden) return forbidden;

      const [analytics, monthlyUsed] = await Promise.all([
        getWorkspaceUsageAnalytics({
          workspaceId: parsed.data.workspaceId,
          limit: parsed.data.limit,
          operation: parsed.data.operation,
          from: parsed.data.from ? new Date(parsed.data.from) : undefined,
          to: parsed.data.to ? new Date(parsed.data.to) : undefined,
        }),
        getWorkspaceMonthlyTokenUsage(parsed.data.workspaceId),
      ]);
      const monthlyLimit = getWorkspaceMonthlyTokenLimit();

      return NextResponse.json({
        ...analytics,
        quota: monthlyLimit
          ? {
              limit: monthlyLimit,
              used: monthlyUsed,
              remaining: Math.max(0, monthlyLimit - monthlyUsed),
            }
          : null,
      });
    },
    { logLabel: "Failed to list usage events" },
  );
}
