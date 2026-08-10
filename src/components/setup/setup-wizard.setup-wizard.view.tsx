import { SetupStepper } from "./setup-wizard.button-type";
import type { useSetupWizardController } from "./setup-wizard.setup-wizard";
import { SetupWizardAgentStep } from "./setup-wizard.setup-wizard.view.agent";
import { SetupWizardModelStep } from "./setup-wizard.setup-wizard.view.model";
import { SetupWizardPart1Step } from "./setup-wizard.setup-wizard.view.part-1";
import { SetupWizardProviderStep } from "./setup-wizard.setup-wizard.view.provider";

export type SetupWizardViewModel = Extract<
  ReturnType<typeof useSetupWizardController>,
  { kind: "ready" }
>;
export function SetupWizardView({ model }: { model: SetupWizardViewModel }) {
  const { onCancelAction, step } = model;
  return (
    <div className="flex flex-col gap-6">
      <SetupStepper currentStep={step} />

      {/* ── Step: Provider ── */}
      {step === "provider" && <SetupWizardProviderStep model={model} />}

      {/* ── Step: SetupWizardViewModel ── */}
      {step === "model" && <SetupWizardModelStep model={model} />}

      {/* ── Step: Agent ── */}
      {step === "agent" && <SetupWizardAgentStep model={model} />}

      {onCancelAction && <SetupWizardPart1Step model={model} />}
    </div>
  );
}
