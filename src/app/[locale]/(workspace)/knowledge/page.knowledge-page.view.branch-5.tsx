import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { KnowledgePageViewModel } from "./page.knowledge-page.view";
export function KnowledgePageBranch5({ model }: { model: KnowledgePageViewModel }) {
  const { baseForm, setBaseForm, t } = model;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
      <Checkbox id="knowledge-global" checked={baseForm.isGlobal} onCheckedChange={(checked) => setBaseForm({ ...baseForm, isGlobal: checked === true })} />
      <div className="grid gap-1.5 leading-none">
        <Label htmlFor="knowledge-global">{t("globalLabel")}</Label>
        <p className="text-xs text-muted-foreground">{t("globalDescription")}</p>
      </div>
    </div>
  );
}
