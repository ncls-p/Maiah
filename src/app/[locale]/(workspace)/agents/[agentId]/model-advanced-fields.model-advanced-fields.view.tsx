import { RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { useModelAdvancedFieldsController } from "./model-advanced-fields.model-advanced-fields";
import { ModelAdvancedFieldsSection1 } from "./model-advanced-fields.model-advanced-fields.view.section-1";

export type ModelAdvancedFieldsViewModel = Extract<ReturnType<typeof useModelAdvancedFieldsController>, { kind: "ready" }>;
export function ModelAdvancedFieldsView({ model }: { model: ModelAdvancedFieldsViewModel }) {
  const { resetGenParams, t } = model;
  return (
    <div className="space-y-4">
      <ModelAdvancedFieldsSection1 model={model} />
      <Button type="button" variant="ghost" size="sm" className="px-0 text-xs" onClick={resetGenParams}>
        <RefreshCwIcon className="size-3" aria-hidden="true" />
        {t("resetDefaults")}
      </Button>
    </div>
  );
}
