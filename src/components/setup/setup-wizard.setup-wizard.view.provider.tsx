import { Loader2, PlugZapIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type OpenAICompatibleApiRoute } from "@/lib/openai-compatible-api";
import {
  BUTTON_TYPE,
  OUTLINE_VARIANT,
  ProviderKind,
} from "./setup-wizard.button-type";
import type { SetupWizardViewModel } from "./setup-wizard.setup-wizard.view";
export function SetupWizardProviderStep({
  model,
}: {
  model: SetupWizardViewModel;
}) {
  const {
    busy,
    createProvider,
    loadingProviders,
    providerForm,
    providers,
    setProviderForm,
    setStep,
    t,
  } = model;
  return (
    <Card className="animate-in-up">
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <PlugZapIcon className="size-5 text-primary" aria-hidden="true" />
          {t("providerTitle")}
        </CardTitle>
        <CardDescription>{t("providerStepDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="provider-name">
              {t("connectionName")}
            </FieldLabel>
            <FieldContent>
              <Input
                id="provider-name"
                name="setup-provider-name"
                autoComplete="organization"
                placeholder={t("connectionNamePlaceholder")}
                value={providerForm.name}
                onChange={(event) =>
                  setProviderForm({
                    ...providerForm,
                    name: event.target.value,
                  })
                }
              />
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="provider-kind">{t("providerType")}</FieldLabel>
            <FieldContent>
              <Select
                value={providerForm.kind}
                onValueChange={(value) =>
                  setProviderForm({
                    ...providerForm,
                    kind: value as ProviderKind,
                  })
                }
              >
                <SelectTrigger id="provider-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="openai-compatible">
                      OpenAI-compatible
                    </SelectItem>
                    <SelectItem value="vercel-ai-gateway">
                      Vercel AI Gateway
                    </SelectItem>
                    <SelectItem value="dragonfly">Dragonfly</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>

          {providerForm.kind === "openai-compatible" ? (
            <Field>
              <FieldLabel htmlFor="openai-compatible-api-route">
                {t("apiRoute")}
              </FieldLabel>
              <FieldContent>
                <Select
                  value={providerForm.openaiCompatibleApiRoute}
                  onValueChange={(value) =>
                    setProviderForm({
                      ...providerForm,
                      openaiCompatibleApiRoute:
                        value as OpenAICompatibleApiRoute,
                    })
                  }
                >
                  <SelectTrigger
                    id="openai-compatible-api-route"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="responses">
                        {t("apiRouteResponses")}
                      </SelectItem>
                      <SelectItem value="chat-completions">
                        {t("apiRouteChatCompletions")}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>{t("apiRouteHint")}</FieldDescription>
              </FieldContent>
            </Field>
          ) : null}

          <Field>
            <FieldLabel htmlFor="base-url">{t("serviceUrl")}</FieldLabel>
            <FieldContent>
              <Input
                id="base-url"
                name="setup-provider-base-url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://api.openai.com/v1"
                value={providerForm.baseUrl}
                onChange={(event) =>
                  setProviderForm({
                    ...providerForm,
                    baseUrl: event.target.value,
                  })
                }
              />
              <FieldDescription>{t("serviceUrlHint")}</FieldDescription>
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="api-key">{t("apiKey")}</FieldLabel>
            <FieldContent>
              <Input
                id="api-key"
                name="setup-provider-api-key"
                type="password"
                autoComplete="new-password"
                placeholder="sk-…"
                value={providerForm.apiKey}
                onChange={(event) =>
                  setProviderForm({
                    ...providerForm,
                    apiKey: event.target.value,
                  })
                }
              />
            </FieldContent>
          </Field>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              type={BUTTON_TYPE}
              onClick={() => void createProvider()}
              disabled={busy || !providerForm.name.trim()}
            >
              {busy ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <PlugZapIcon data-icon="inline-start" aria-hidden="true" />
              )}
              {t("saveContinue")}
            </Button>
            {providers.length > 0 ? (
              <Button
                type={BUTTON_TYPE}
                variant={OUTLINE_VARIANT}
                disabled={loadingProviders}
                onClick={() => setStep("model")}
              >
                {t("useExistingConnection")}
              </Button>
            ) : null}
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
