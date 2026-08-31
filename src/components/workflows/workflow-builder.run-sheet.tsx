import { Code2Icon, PlayIcon, RefreshCwIcon, SaveIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

import type { WorkflowBuilderViewModel } from "./workflow-builder.workflow-builder";

export function WorkflowBuilderRunSheet({
  model,
}: {
  model: WorkflowBuilderViewModel;
}) {
  const {
    actionBusy,
    runInput,
    runInputDirty,
    runInputValid,
    runSheetOpen,
    runWorkflow,
    running,
    save,
    saving,
    setRunInput,
    setRunSheetOpen,
    t,
  } = model;
  return (
    <Sheet open={runSheetOpen} onOpenChange={setRunSheetOpen}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t("runTitle")}</SheetTitle>
          <SheetDescription className="leading-6">
            {t("runDescription")}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 px-5 pb-5">
          <div className="flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/5 p-3 text-sm">
            <Code2Icon
              className="mt-0.5 size-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <p className="leading-5 text-muted-foreground">
              {t("runInputSavedHint")}
            </p>
          </div>
          <FieldGroup>
            <Field data-invalid={!runInputValid || undefined}>
              <FieldLabel htmlFor="workflow-run-input">
                {t("runInput")}
              </FieldLabel>
              <FieldContent>
                <Textarea
                  id="workflow-run-input"
                  value={runInput}
                  onChange={(event) => setRunInput(event.target.value)}
                  aria-invalid={!runInputValid}
                  className="min-h-72 font-mono text-xs"
                  spellCheck={false}
                />
                <FieldDescription
                  className={!runInputValid ? "text-destructive" : undefined}
                >
                  {runInputValid
                    ? t(runInputDirty ? "runInputUnsaved" : "runInputSaved")
                    : t("invalidJson")}
                </FieldDescription>
              </FieldContent>
            </Field>
          </FieldGroup>
          <div className="mt-auto grid gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              onClick={() => void save()}
              disabled={actionBusy || !runInputValid || !runInputDirty}
            >
              {saving ? (
                <RefreshCwIcon
                  data-icon="inline-start"
                  className="animate-spin"
                />
              ) : (
                <SaveIcon data-icon="inline-start" />
              )}
              {t("saveRunInput")}
            </Button>
            <Button
              onClick={() => void runWorkflow()}
              disabled={actionBusy || !runInputValid}
            >
              {running ? (
                <RefreshCwIcon
                  data-icon="inline-start"
                  className="animate-spin"
                />
              ) : (
                <PlayIcon data-icon="inline-start" />
              )}
              {t("runNow")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
