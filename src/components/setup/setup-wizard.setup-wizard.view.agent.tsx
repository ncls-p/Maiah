import { Link } from "@/i18n/navigation";
import { Loader2,MessageSquareIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card,CardContent,CardDescription,CardHeader,CardTitle } from "@/components/ui/card";
import { Field,FieldContent,FieldDescription,FieldGroup,FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { BUTTON_TYPE,OUTLINE_VARIANT } from "./setup-wizard.button-type";
import type { SetupWizardViewModel } from "./setup-wizard.setup-wizard.view";
export function SetupWizardAgentStep({ model }: { model: SetupWizardViewModel }) {
  const { agentForm, agentId, busy, finishSetup, mode, modelDbId, selectedModel, selectedProvider, setAgentForm, setStep, t } = model;
  return (
    <Card className="animate-in-up">
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <MessageSquareIcon className="size-5 text-primary" aria-hidden="true" />
          {t("agentTitle")}
        </CardTitle>
        <CardDescription>{t("agentStepDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {/* Summary */}
          <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("connection")}</span>
                <span className="font-medium">{selectedProvider?.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("model")}</span>
                <span className="font-medium">{selectedModel?.displayName ?? selectedModel?.modelId}</span>
              </div>
            </div>
          </div>

          {agentId ? (
            <FieldDescription>{t("currentAssistantHint")}</FieldDescription>
          ) : (
            <Field>
              <FieldLabel htmlFor="agent-name">{t("assistantName")}</FieldLabel>
              <FieldContent>
                <Input id="agent-name" name="setup-agent-name" autoComplete="off" placeholder={t("assistantNamePlaceholder")} value={agentForm.name} onChange={(event) => setAgentForm({ name: event.target.value })} />
              </FieldContent>
            </Field>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button type={BUTTON_TYPE} onClick={() => void finishSetup()} disabled={busy || !modelDbId || (!agentId && !agentForm.name.trim())}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <MessageSquareIcon data-icon="inline-start" aria-hidden="true" />}
              {t("startChat")}
            </Button>
            <Button type={BUTTON_TYPE} variant={OUTLINE_VARIANT} onClick={() => setStep("model")}>
              {t("back")}
            </Button>
            {mode === "page" && (
              <Button variant="ghost" asChild>
                <Link href={agentId ? `/chat?agentId=${agentId}` : "/chat"}>{t("skipForNow")}</Link>
              </Button>
            )}
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
