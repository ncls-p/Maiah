import { handleRoute } from "@/lib/route-handler";
import { getAvailableApiKeyScopes } from "@/modules/api-keys/permissions";
import { API_KEY_SCOPE_PRESETS } from "@/modules/api-keys/scopes";
import {
  createWorkspaceApiKey,
  listWorkspaceApiKeys,
} from "@/modules/api-keys/use-cases";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getApiKeyRouteAccess } from "./api-key-route-access";

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
      const access = await getApiKeyRouteAccess(
        session.user.id,
        parsed.data.workspaceId,
      );
      if (!access.ok) return access.response;
      const { accessScope } = access;
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
      const access = await getApiKeyRouteAccess(
        session.user.id,
        parsed.data.workspaceId,
      );
      if (!access.ok) return access.response;
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
        // Whitelist the expected domain messages (fixed text — the raw
        // message may embed caller-supplied scope names); anything else
        // falls through to the generic 500 + server log.
        const message = error instanceof Error ? error.message : null;
        if (message?.startsWith("At least one API token scope")) {
          return NextResponse.json(
            { error: "At least one API token scope is required" },
            { status: 400 },
          );
        }
        if (message?.startsWith("Unknown API token scopes")) {
          return NextResponse.json(
            { error: "Unknown API token scopes" },
            { status: 400 },
          );
        }
        if (message?.startsWith("API token scopes exceed")) {
          return NextResponse.json(
            { error: "API token scopes exceed current permissions" },
            { status: 400 },
          );
        }
        return null;
      },
    },
  );
}
