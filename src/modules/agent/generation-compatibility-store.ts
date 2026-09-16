import { createHash } from "node:crypto";
import { inArray, like } from "drizzle-orm";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import { db } from "@/server/infrastructure/db";
import { appSettings } from "@/server/infrastructure/db/schema";
import { logger } from "@/lib/logger";
import {
  unsupportedSettings,
  withGenerationCompatibility,
} from "./generation-compatibility";

// Version + actual provider/model prevents exclusions leaking across model changes
// or pinned specialist versions. One row per setting gives atomic concurrent union.
export async function applyGenerationCompatibility(
  model: LanguageModelV4,
  versionId: string,
) {
  const scope = createHash("sha256")
    .update(JSON.stringify([versionId, model.provider, model.modelId]))
    .digest("hex");
  const key = (setting: string) =>
    `generation:${versionId}:${scope.slice(0, 24)}:${setting}`;
  const rows = await db
    .select({ key: appSettings.key })
    .from(appSettings)
    .where(inArray(appSettings.key, unsupportedSettings.map(key)));
  const keys = new Set(rows.map((row) => row.key));
  return withGenerationCompatibility(model, {
    excluded: unsupportedSettings.filter((setting) => keys.has(key(setting))),
    persist: async (setting) => {
      await db
        .insert(appSettings)
        .values({ key: key(setting), valueJson: { versionId, setting } })
        .onConflictDoNothing();
      logger.info(
        "Unsupported generation setting excluded for assistant version",
        { versionId, setting },
      );
    },
  });
}

export async function generationCompatibilityForVersion(versionId: string) {
  const rows = await db
    .select({ value: appSettings.valueJson })
    .from(appSettings)
    .where(like(appSettings.key, `generation:${versionId}:%`));
  return [
    ...new Set(rows.map((row) => (row.value as { setting: string }).setting)),
  ];
}
