import { NextRequest, NextResponse } from "next/server";

import { handleRoute } from "@/lib/route-handler";
import { requireAdminApiSession } from "@/modules/admin/auth";
import {
  getDefaultRagConfig,
  ragConfigSchema,
  setDefaultRagConfig,
} from "@/modules/knowledge/rag-config";
import { queueDefaultRagReindex } from "@/modules/knowledge/use-cases";

export async function GET() {
  const auth = await requireAdminApiSession();
  if (!auth.ok) return auth.response;
  return NextResponse.json(await getDefaultRagConfig());
}

export async function PATCH(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const auth = await requireAdminApiSession();
      if (!auth.ok) return auth.response;
      const parsed = ragConfigSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      }
      const config = await setDefaultRagConfig(parsed.data, session.user.id);
      await queueDefaultRagReindex();
      return NextResponse.json(config);
    },
    { logLabel: "Failed to update RAG defaults" },
  );
}
