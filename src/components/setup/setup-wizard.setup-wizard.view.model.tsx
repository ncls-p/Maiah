import { CheckCircle2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card,CardContent,CardDescription,CardHeader,CardTitle } from "@/components/ui/card";
import { Field,FieldContent,FieldDescription,FieldGroup,FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select,SelectContent,SelectGroup,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import { BUTTON_TYPE,ModelMetadata,OUTLINE_VARIANT } from "./setup-wizard.button-type";
import type { SetupWizardViewModel } from "./setup-wizard.setup-wizard.view";
export function SetupWizardModelStep({ model }: { model: SetupWizardViewModel }) {
  const { addAndSelectModel, addDiscoveredModel, busy, discoveredModels, loadingModels, manualModelId, modelDbId, models, providerId, providers, selectedModel, setManualModelId, setModelDbId, setProviderId, setStep, t } = model;
  return (
    <Card className="animate-in-up">
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <CheckCircle2Icon className="size-5 text-primary" aria-hidden="true" />
          {t("modelTitle")}
        </CardTitle>
        <CardDescription>{t("modelStepDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {providers.length > 0 ? (
            <Field>
              <FieldLabel htmlFor="setup-provider">{t("connection")}</FieldLabel>
              <FieldContent>
                <Select
                  value={providerId ?? undefined}
                  onValueChange={(value) => {
                    setProviderId(value);
                    setModelDbId(null);
                  }}
                >
                  <SelectTrigger id="setup-provider" className="w-full">
                    <SelectValue placeholder={t("selectConnection")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {providers.map((provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {provider.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type={BUTTON_TYPE} variant="ghost" onClick={() => setStep("provider")}>
              {t("changeConnection")}
            </Button>
          </div>

          {/* Saved models selector */}
          {models.length > 0 && (
            <Field>
              <FieldLabel htmlFor="setup-model">{t("modelForAssistant")}</FieldLabel>
              <FieldContent>
                <Select value={modelDbId ?? undefined} onValueChange={setModelDbId} disabled={loadingModels}>
                  <SelectTrigger id="setup-model" className="w-full">
                    <SelectValue placeholder={t("selectModel")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {models.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.displayName ?? model.modelId}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {selectedModel && <ModelMetadata capabilities={selectedModel.capabilitiesJson} contextWindow={selectedModel.contextWindow} maxOutputTokens={selectedModel.maxOutputTokens} inputTokenCost={selectedModel.inputTokenCost} outputTokenCost={selectedModel.outputTokenCost} enabled={selectedModel.enabled} />}
              </FieldContent>
            </Field>
          )}

          {models.length === 0 && discoveredModels.length > 0 && (
            <Field>
              <FieldLabel htmlFor="setup-discovered-model">{t("modelForAssistant")}</FieldLabel>
              <FieldContent>
                <Select onValueChange={(value) => void addDiscoveredModel(value)} disabled={loadingModels || busy}>
                  <SelectTrigger id="setup-discovered-model" className="w-full">
                    <SelectValue placeholder={t("selectModel")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {discoveredModels.map((model) => (
                        <SelectItem key={model.modelId} value={model.modelId}>
                          {model.displayName ?? model.modelId}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
          )}

          {models.length === 0 && discoveredModels.length === 0 && (
            <Field>
              <FieldLabel htmlFor="manual-model">{t("manualModelLabel")}</FieldLabel>
              <FieldContent>
                <div className="flex gap-2">
                  <Input id="manual-model" name="setup-manual-model" autoComplete="off" placeholder="gpt-4o-mini…" value={manualModelId} onChange={(event) => setManualModelId(event.target.value)} />
                  <Button type={BUTTON_TYPE} variant={OUTLINE_VARIANT} disabled={busy || !providerId || !manualModelId.trim()} onClick={() => void addAndSelectModel()}>
                    {t("addModel")}
                  </Button>
                </div>
                <FieldDescription>{t("noRegisteredModels")}</FieldDescription>
              </FieldContent>
            </Field>
          )}

          <Button type={BUTTON_TYPE} className="mt-2" onClick={() => setStep("agent")} disabled={!modelDbId}>
            {t("continue")}
          </Button>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
