import { Checkbox } from "@/components/ui/checkbox";
import { FieldGroup } from "@/components/ui/field";

import type { EssentialTabViewModel } from "./essential-tab.view";
export function EssentialTabBranch2({
  model,
}: {
  model: EssentialTabViewModel;
}) {
  const { form, setForm, t } = model;
  return (
    <FieldGroup className="gap-3 border-t border-border/50 pt-4">
      <label className="flex items-center gap-3 rounded-xl border border-border/60 p-3 text-sm">
        <Checkbox
          aria-label={t("configurePage.globalAssistant")}
          checked={form.isGlobal}
          onCheckedChange={(checked) =>
            setForm((prev) => ({
              ...prev,
              isGlobal: checked === true,
            }))
          }
        />
        {t("configurePage.globalAssistant")}
      </label>
      <label className="flex items-center gap-3 rounded-xl border border-border/60 p-3 text-sm">
        <Checkbox
          aria-label={t("configurePage.recommended")}
          checked={form.isRecommended}
          onCheckedChange={(checked) =>
            setForm((prev) => ({
              ...prev,
              isRecommended: checked === true,
            }))
          }
        />
        {t("configurePage.recommended")}
      </label>
    </FieldGroup>
  );
}
