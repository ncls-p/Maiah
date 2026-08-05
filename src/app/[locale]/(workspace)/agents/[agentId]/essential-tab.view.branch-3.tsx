import { Field,FieldContent,FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import type { EssentialTabViewModel } from "./essential-tab.view";
export function EssentialTabBranch3({ model }: { model: EssentialTabViewModel }) {
  const { form, setForm, t } = model;
  return (
    <Field>
      <FieldLabel htmlFor="agent-share-email">{t("configurePage.email")}</FieldLabel>
      <FieldContent>
        <Input
          id="agent-share-email"
          type="email"
          value={form.shareTargetEmail}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              shareTargetEmail: e.target.value,
            }))
          }
        />
      </FieldContent>
    </Field>
  );
}
