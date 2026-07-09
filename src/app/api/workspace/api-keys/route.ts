import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleRoute, requireWorkspaceMemberAsync } from "@/lib/route-handler";
import { getApiKeyAccessScope } from "@/modules/api-keys/permissions";
import {
  createWorkspaceApiKey,
  listWorkspaceApiKeys,
} from "@/modules/api-keys/use-cases";

const querySchema = z.object({ workspaceId: z.uuid() });
const createSchema = z.object({
  workspaceId: z.uuid(),
  name: z.string().min(1).max(255),
  expiresAt: z.iso.datetime().optional(),
});

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = querySchema.safeParse({
        workspaceId: req.nextUrl.searchParams.get("workspaceId"),
      });
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid input" }, { status: 400 });
      }
      const forbidden = await requireWorkspaceMemberAsync(
        session.user.id,
        parsed.data.workspaceId,
      );
      if (forbidden) return forbidden;
      const accessScope = await getApiKeyAccessScope(
        session.user.id,
        parsed.data.workspaceId,
      );
      if (!accessScope) {
        return NextResponse.json(
          {
            error: "Forbidden",
            reason: "Missing permission: apiKeys.manageOwn",
          },
          { status: 403 },
        );
      }
      return NextResponse.json({
        keys: await listWorkspaceApiKeys(
          parsed.data.workspaceId,
          accessScope === "own" ? { createdById: session.user.id } : undefined,
        ),
      });
    },
    { logLabel: "Failed to list API keys" },
  );
}

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = createSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      }
      const forbidden = await requireWorkspaceMemberAsync(
        session.user.id,
        parsed.data.workspaceId,
      );
      if (forbidden) return forbidden;
      const accessScope = await getApiKeyAccessScope(
        session.user.id,
        parsed.data.workspaceId,
      );
      if (!accessScope) {
        return NextResponse.json(
          {
            error: "Forbidden",
            reason: "Missing permission: apiKeys.manageOwn",
          },
          { status: 403 },
        );
      }
      const result = await createWorkspaceApiKey({
        workspaceId: parsed.data.workspaceId,
        userId: session.user.id,
        name: parsed.data.name,
        expiresAt: parsed.data.expiresAt
          ? new Date(parsed.data.expiresAt)
          : null,
      });
      return NextResponse.json(result, { status: 201 });
    },
    { logLabel: "Failed to create API key" },
  );
}
