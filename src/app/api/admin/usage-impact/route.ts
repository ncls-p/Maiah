import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { handleRoute } from "@/lib/route-handler";
import { requireAdminApiSession } from "@/modules/admin/auth";
import {
  getUsageImpactSetting,
  setUsageImpactSetting,
} from "@/modules/provider/usage-impact-settings";
import { refreshAllProviderModels } from "@/modules/provider/use-cases";

const updateSchema = z.object({
  enabled: z.boolean(),
  co2GramsPerKwh: z.number().finite().nonnegative().optional(),
});

export async function GET() {
  const auth = await requireAdminApiSession();
  if (!auth.ok) return auth.response;
  return NextResponse.json(await getUsageImpactSetting());
}

export async function PATCH(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const auth = await requireAdminApiSession();
      if (!auth.ok) return auth.response;
      const parsed = updateSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      }

      const setting = await setUsageImpactSetting(parsed.data, session.user.id);
      const refresh = setting.enabled
        ? await refreshAllProviderModels()
        : {
            totalProviders: 0,
            refreshedProviders: 0,
            failedProviders: 0,
            importedModels: 0,
          };
      return NextResponse.json({ ...setting, refresh });
    },
    { logLabel: "Failed to update usage impact settings" },
  );
}
