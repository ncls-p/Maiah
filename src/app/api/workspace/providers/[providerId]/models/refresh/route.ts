import {
  handleRoute,
  requireResourcePermissionAsync,
} from "@/lib/route-handler";
import {
  getProviderById,
  refreshProviderModels,
} from "@/modules/provider/use-cases";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const paramsSchema = z.object({ providerId: z.uuid() });
const bodySchema = z.object({ workspaceId: z.uuid() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ providerId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = paramsSchema.safeParse(await params);
      const parsedBody = bodySchema.safeParse(await req.json());
      if (!parsedParams.success || !parsedBody.success) {
        return NextResponse.json({ error: "Invalid input" }, { status: 400 });
      }
      const { providerId } = parsedParams.data;
      const { workspaceId } = parsedBody.data;
      const forbidden = await requireResourcePermissionAsync(
        session.user.id,
        workspaceId,
        "models.sync",
        "provider",
        providerId,
      );
      if (forbidden) return forbidden;
      const provider = await getProviderById(providerId, workspaceId);
      if (!provider) {
        return NextResponse.json(
          { error: "Provider not found" },
          { status: 404 },
        );
      }
      return NextResponse.json(
        await refreshProviderModels(providerId, workspaceId),
      );
    },
    { logLabel: "Failed to refresh provider models" },
  );
}
