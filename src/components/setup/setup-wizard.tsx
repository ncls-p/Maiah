"use client";
import { useSetupWizardController } from "./setup-wizard.setup-wizard";
import { SetupWizardView } from "./setup-wizard.setup-wizard";

export type { SetupWizardProps } from "./setup-wizard.button-type";

export function SetupWizard(
  ...args: Parameters<typeof useSetupWizardController>
) {
  const model = useSetupWizardController(...args);
  if (!("kind" in model)) return model;
  return <SetupWizardView model={model} />;
}
