import { SaveIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { RagSettingsViewModel } from "./rag-settings.rag-settings.view";
import { RagSettingsFieldsSection1 } from "./rag-settings.rag-settings.view.section-1.section-1";
import { RagSettingsFieldsSection2 } from "./rag-settings.rag-settings.view.section-1.section-2";
import { RagSettingsFieldsSection3 } from "./rag-settings.rag-settings.view.section-1.section-3";
import { RagSettingsFieldsSection4 } from "./rag-settings.rag-settings.view.section-1.section-4";

export function RagSettingsSection1({ model }: { model: RagSettingsViewModel }) {
  const { save, saving, t } = model;
  return (
    <div className="grid gap-5">
      <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">{t("simpleHint")}</div>
      <RagSettingsFieldsSection4 model={model} />
      <RagSettingsFieldsSection3 model={model} />
      <RagSettingsFieldsSection2 model={model} />
      <RagSettingsFieldsSection1 model={model} />
      <Button type="button" onClick={() => void save()} disabled={saving}>
        {saving ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
        {t("save")}
      </Button>
    </div>
  );
}
