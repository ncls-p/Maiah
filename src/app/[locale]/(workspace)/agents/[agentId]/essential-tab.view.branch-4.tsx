import { SelectItem } from "@/components/ui/select";

import type { EssentialTabViewModel } from "./essential-tab.view";
export function EssentialTabBranch4({ model }: { model: EssentialTabViewModel }) {
  const { t } = model;
  return <SelectItem value="marketplace">{t("configurePage.sharingWorkspace")}</SelectItem>;
}
