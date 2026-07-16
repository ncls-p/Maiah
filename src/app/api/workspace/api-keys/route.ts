import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleRoute, requireWorkspaceMemberAsync } from "@/lib/route-handler";
import {
  getApiKeyAccessScope,
  getAvailableApiKeyScopes,
} from "@/modules/api-keys/permissions";
import { API_KEY_SCOPE_PRESETS } from "@/modules/api-keys/scopes";
import {
  createWorkspaceApiKey,
  listWorkspaceApiKeys,
} from "@/modules/api-keys/use-cases";

const querySchema = z.object({ workspaceId: z.uuid() });
const createSchema = z.object({
  workspaceId: z.uuid(),
  name: z.string().min(1).max(255),
  expiresAt: z.iso.datetime().optional(),
  scopes: z.array(z.string().min(1)).min(1).max(64),
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
      const [keys, availableScopes] = await Promise.all([
        listWorkspaceApiKeys(
          parsed.data.workspaceId,
          accessScope === "own" ? { createdById: session.user.id } : undefined,
        ),
        getAvailableApiKeyScopes(session.user.id, parsed.data.workspaceId),
      ]);
      return NextResponse.json({
        keys,
        availableScopes,
        presets: API_KEY_SCOPE_PRESETS,
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
        scopes: parsed.data.scopes,
      });
      return NextResponse.json(result, { status: 201 });
    },
    {
      logLabel: "Failed to create API key",
      expectedError: (error) => {
        const message = error instanceof Error ? error.message : null;
        if (
          message?.startsWith("At least one API token scope") ||
          message?.startsWith("Unknown API token scopes") ||
          message?.startsWith("API token scopes exceed")
        ) {
          return NextResponse.json({ error: message }, { status: 400 });
        }
        return null;
      },
    },
  );
}
