import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { RagSettingsViewModel } from "./rag-settings.rag-settings.view";
export function RagSettingsFieldsSection2({
  model,
}: {
  model: RagSettingsViewModel;
}) {
  const {
    discovering,
    modelValue,
    rerankingModels,
    selectModel,
    setSettings,
    settings,
    t,
  } = model;
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="rag-reranking" help={t("rerankingHint")}>
            {t("reranking")}
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("rerankingHint")}
          </p>
        </div>
        <Switch
          id="rag-reranking"
          checked={settings.reranking.enabled}
          onCheckedChange={(enabled) =>
            setSettings({
              ...settings,
              reranking: { ...settings.reranking, enabled },
            })
          }
        />
      </div>
      {settings.reranking.enabled ? (
        <div className="mt-4 grid gap-1.5">
          <Label
            htmlFor="rag-discovered-reranking-model"
            help={t("rerankingModelHelp")}
          >
            {t("discoveredRerankingModel")}
          </Label>
          <Select onValueChange={(value) => selectModel(value, "reranking")}>
            <SelectTrigger id="rag-discovered-reranking-model">
              <SelectValue
                placeholder={
                  discovering ? t("discoveringModels") : t("selectModel")
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {rerankingModels.map((model) => (
                  <SelectItem key={modelValue(model)} value={modelValue(model)}>
                    {model.providerName} · {model.displayName || model.modelId}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Label htmlFor="rag-reranking-model" help={t("rerankingModelHelp")}>
            {t("rerankingModel")}
          </Label>
          <Input
            id="rag-reranking-model"
            value={settings.reranking.modelId}
            onChange={(event) =>
              setSettings({
                ...settings,
                reranking: {
                  ...settings.reranking,
                  modelId: event.target.value,
                },
              })
            }
            placeholder={t("modelPlaceholder")}
          />
        </div>
      ) : null}
    </div>
  );
}
