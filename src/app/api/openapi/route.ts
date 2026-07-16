import { NextResponse } from "next/server";

import { buildOpenApiDocument } from "@/modules/openapi/openapi";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(buildOpenApiDocument(), {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}
