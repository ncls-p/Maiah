import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/infrastructure/db";
import { appSettings } from "@/server/infrastructure/db/schema";

export const USAGE_IMPACT_SETTING_KEY = "usage-impact";

export const usageImpactSettingSchema = z.object({
  enabled: z.boolean().default(false),
  co2GramsPerKwh: z.number().finite().nonnegative().optional(),
});

export type UsageImpactSetting = z.infer<typeof usageImpactSettingSchema>;

export async function getUsageImpactSetting(): Promise<UsageImpactSetting> {
  const [row] = await db
    .select({ valueJson: appSettings.valueJson })
    .from(appSettings)
    .where(eq(appSettings.key, USAGE_IMPACT_SETTING_KEY))
    .limit(1);

  const parsed = usageImpactSettingSchema.safeParse(row?.valueJson);
  return parsed.success ? parsed.data : usageImpactSettingSchema.parse({});
}

export async function setUsageImpactSetting(
  setting: UsageImpactSetting,
  updatedById: string,
) {
  const valueJson = usageImpactSettingSchema.parse(setting);
  await db
    .insert(appSettings)
    .values({
      key: USAGE_IMPACT_SETTING_KEY,
      valueJson,
      updatedById,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        valueJson,
        updatedById,
        updatedAt: new Date(),
      },
  });
  return valueJson;
}
