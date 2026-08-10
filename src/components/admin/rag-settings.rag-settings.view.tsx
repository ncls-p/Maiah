import { DatabaseZapIcon } from "lucide-react";

import {
  SettingsSection,
  SettingsStatusBadge,
} from "@/components/admin/settings-panel";
import type { useRagSettingsController } from "./rag-settings.rag-settings";
import { RagSettingsSection1 } from "./rag-settings.rag-settings.view.section-1";

export type RagSettingsViewModel = Extract<
  ReturnType<typeof useRagSettingsController>,
  { kind: "ready" }
>;
export function RagSettingsView({ model }: { model: RagSettingsViewModel }) {
  const { configured, t } = model;
  return (
    <SettingsSection
      icon={DatabaseZapIcon}
      title={t("title")}
      description={t("description")}
      badge={
        <SettingsStatusBadge
          label={configured ? t("statusConfigured") : t("statusFallback")}
          tone={configured ? "success" : "warning"}
        />
      }
    >
      <RagSettingsSection1 model={model} />
    </SettingsSection>
  );
}
