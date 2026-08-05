import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";

import { handleRoute } from "@/lib/route-handler";
import {
getOrganizationBranding,
ORGANIZATION_THEMES,
updateOrganizationBranding,
} from "@/modules/organization/branding";
import { THEME_TOKEN_KEYS } from "@/modules/organization/themes";

const querySchema = z.object({ workspaceId: z.uuid() });
const paletteSchema = z.record(
  z.enum(THEME_TOKEN_KEYS),
  z.string().regex(/^#[0-9a-fA-F]{6}$/),
);
const themeConfigSchema = z.strictObject({
  light: paletteSchema,
  dark: paletteSchema,
});
const updateSchema = z
  .strictObject({
    workspaceId: z.uuid(),
    theme: z.enum(ORGANIZATION_THEMES),
    themeConfig: themeConfigSchema.nullable().optional().default(null),
    logoUrl: z.union([
      z
        .string()
        .max(360_000)
        .regex(/^data:image\/(png|jpeg|webp|gif|avif);base64,/),
      z.null(),
    ]),
  })
  .refine((input) => input.theme !== "custom" || input.themeConfig !== null, {
    message: "A custom theme requires light and dark palettes",
    path: ["themeConfig"],
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
        themeConfig: result.organization.themeConfigJson,
      });
    },
    { allowApiKey: false, logLabel: "Failed to update organization branding" },
  );
}
