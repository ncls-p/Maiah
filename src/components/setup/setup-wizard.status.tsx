import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { BUTTON_TYPE,OUTLINE_VARIANT } from "./setup-wizard.button-type";

export function SetupWizardLoading() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export function SetupWizardLoadError({ title, description, retryLabel, onRetry }: { title: string; description: string; retryLabel: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5" role="alert">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <Button type={BUTTON_TYPE} variant={OUTLINE_VARIANT} size="sm" className="mt-4" onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  );
}
