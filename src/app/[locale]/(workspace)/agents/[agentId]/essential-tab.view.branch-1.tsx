import { SaveIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import type { EssentialTabViewModel } from "./essential-tab.view";
export function EssentialTabBranch1({ model }: { model: EssentialTabViewModel }) {
  const { saving, tCommon } = model;
  return (
    <div className="flex justify-end rounded-2xl border border-border/60 bg-card/75 p-3 shadow-[var(--surface-shadow)]">
      <Button type="submit" disabled={saving}>
        {saving ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" aria-hidden="true" />}
        {tCommon("save")}
      </Button>
    </div>
  );
}
