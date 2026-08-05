import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { handleRoute } from "@/lib/route-handler";
import {
  getOrganizationBranding,
  ORGANIZATION_THEMES,
  updateOrganizationBranding,
} from "@/modules/organization/branding";

const querySchema = z.object({ workspaceId: z.uuid() });
const updateSchema = z.object({
  workspaceId: z.uuid(),
  theme: z.enum(ORGANIZATION_THEMES),
  logoUrl: z.union([
    z
      .string()
      .max(360_000)
      .regex(/^data:image\/(png|jpeg|webp|gif|avif);base64,/),
    z.null(),
  ]),
});

export async function GET(request: NextRequest) {
  return handleRoute(
    request,
    async ({ session }) => {
      const parsed = querySchema.safeParse({
        workspaceId: request.nextUrl.searchParams.get("workspaceId"),
      });
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid input" }, { status: 400 });
      }
      const branding = await getOrganizationBranding({
        workspaceId: parsed.data.workspaceId,
        userId: session.user.id,
      });
      return branding
        ? NextResponse.json(branding)
        : NextResponse.json({ error: "Not found" }, { status: 404 });
    },
    { allowApiKey: false, logLabel: "Failed to load organization branding" },
  );
}

export async function PUT(request: NextRequest) {
  return handleRoute(
    request,
    async ({ session }) => {
      const parsed = updateSchema.safeParse(await request.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      }
      const result = await updateOrganizationBranding({
        ...parsed.data,
        userId: session.user.id,
      });
      if (result.status === "forbidden") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (result.status === "not_found") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({
        logoUrl: result.organization.logoUrl,
        theme: result.organization.theme,
      });
    },
    { allowApiKey: false, logLabel: "Failed to update organization branding" },
  );
}
