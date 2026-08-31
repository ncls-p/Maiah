import { handleRoute } from "@/lib/route-handler";
import { revokeWorkspaceApiKey } from "@/modules/api-keys/use-cases";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getApiKeyRouteAccess } from "../api-key-route-access";

const querySchema = z.object({ workspaceId: z.uuid() });

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ keyId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const { keyId } = await params;
      const parsed = querySchema.safeParse({
        workspaceId: req.nextUrl.searchParams.get("workspaceId"),
      });
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid input" }, { status: 400 });
      }

      const access = await getApiKeyRouteAccess(
        session.user.id,
        parsed.data.workspaceId,
      );
      if (!access.ok) return access.response;
      const { accessScope } = access;

      await revokeWorkspaceApiKey({
        keyId,
        workspaceId: parsed.data.workspaceId,
        userId: session.user.id,
        createdById: accessScope === "own" ? session.user.id : undefined,
      });

      return NextResponse.json({ ok: true });
    },
    {
      logLabel: "Failed to revoke API key",
      expectedError: (error) => {
        // Whitelist the single expected domain message; anything else (e.g.
        // database errors) falls through to the generic 500 + server log.
        if (error instanceof Error && error.message === "API key not found") {
          return NextResponse.json(
            { error: "API key not found" },
            { status: 400 },
          );
        }
        return null;
      },
    },
  );
}
