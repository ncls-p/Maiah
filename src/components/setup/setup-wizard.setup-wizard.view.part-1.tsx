import { Button } from "@/components/ui/button";
import { BUTTON_TYPE } from "./setup-wizard.button-type";
import type { SetupWizardViewModel } from "./setup-wizard.setup-wizard.view";
export function SetupWizardPart1Step({ model }: { model: SetupWizardViewModel }) {
  const { onCancelAction, t } = model;
  return (
    <Button type={BUTTON_TYPE} variant="ghost" onClick={onCancelAction}>
      {t("cancel")}
    </Button>
  );
}
