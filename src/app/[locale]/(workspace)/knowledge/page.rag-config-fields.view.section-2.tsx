import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select,SelectContent,SelectGroup,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import type { RagConfigFieldsViewModel } from "./page.rag-config-fields.view";
export function RagConfigFieldsSection2({ model }: { model: RagConfigFieldsViewModel }) {
  const { canManageModels, config, discoveringModels, idPrefix, modelValue, onChange, rerankingModels, selectModel, t } = model;
  return (
    <div className="grid gap-3 rounded-lg border p-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr))]">
      <div className="flex min-w-0 items-center gap-2">
        <Checkbox
          id={`${idPrefix}-reranking`}
          checked={config.reranking.enabled}
          onCheckedChange={(checked) =>
            onChange({
              ...config,
              reranking: {
                ...config.reranking,
                enabled: checked === true,
              },
            })
          }
        />
        <Label htmlFor={`${idPrefix}-reranking`} help={t("ragRerankingHelp")}>
          {t("ragReranking")}
        </Label>
      </div>
      {canManageModels ? (
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={`${idPrefix}-reranking-model`} help={t("ragRerankingModelHelp")}>
            {t("ragRerankingModel")}
          </Label>
          <Select disabled={!config.reranking.enabled} onValueChange={(value) => selectModel(value, "reranking")}>
            <SelectTrigger id={`${idPrefix}-reranking-model`} className="min-w-0">
              <SelectValue placeholder={discoveringModels ? t("ragDiscoveringModels") : t("ragSelectModel")} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {rerankingModels.map((model) => (
                  <SelectItem key={`reranking-${modelValue(model)}`} value={modelValue(model)}>
                    {model.providerName} · {model.displayName || model.modelId}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Input
            aria-label={t("ragExactRerankingModelId")}
            disabled={!config.reranking.enabled}
            value={config.reranking.modelId}
            onChange={(event) =>
              onChange({
                ...config,
                reranking: {
                  ...config.reranking,
                  providerId: null,
                  modelId: event.target.value,
                },
              })
            }
            placeholder={t("ragExactRerankingModelId")}
          />
        </div>
      ) : (
        <p className="pb-2 text-xs text-muted-foreground">{config.reranking.modelId || t("ragInheritedModel")}</p>
      )}
    </div>
  );
}
