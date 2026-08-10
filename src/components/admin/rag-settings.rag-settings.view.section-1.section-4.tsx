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
import type { RagSettingsViewModel } from "./rag-settings.rag-settings.view";
export function RagSettingsFieldsSection4({
  model,
}: {
  model: RagSettingsViewModel;
}) {
  const {
    discovering,
    embeddingModels,
    modelValue,
    numberValue,
    selectModel,
    setSettings,
    settings,
    t,
  } = model;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="grid gap-1.5">
        <Label
          htmlFor="rag-discovered-embedding-model"
          help={t("discoveredEmbeddingModelHelp")}
        >
          {t("discoveredEmbeddingModel")}
        </Label>
        <Select onValueChange={(value) => selectModel(value, "embedding")}>
          <SelectTrigger id="rag-discovered-embedding-model">
            <SelectValue
              placeholder={
                discovering ? t("discoveringModels") : t("selectModel")
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {embeddingModels.map((model) => (
                <SelectItem key={modelValue(model)} value={modelValue(model)}>
                  {model.providerName} · {model.displayName || model.modelId}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Label htmlFor="rag-embedding-model" help={t("embeddingModelHelp")}>
          {t("embeddingModel")}
        </Label>
        <Input
          id="rag-embedding-model"
          value={settings.embedding.modelId}
          onChange={(event) =>
            setSettings({
              ...settings,
              embedding: {
                ...settings.embedding,
                modelId: event.target.value,
              },
            })
          }
          placeholder={t("modelPlaceholder")}
        />
        <p className="text-xs text-muted-foreground">{t("autoProviderHint")}</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="rag-dimensions" help={t("dimensionsHelp")}>
          {t("dimensions")}
        </Label>
        <Input
          id="rag-dimensions"
          type="number"
          min={1}
          value={settings.embedding.dimensions ?? ""}
          onChange={(event) =>
            setSettings({
              ...settings,
              embedding: {
                ...settings.embedding,
                dimensions: event.target.value
                  ? numberValue(event.target.value, 1)
                  : null,
              },
            })
          }
          placeholder={t("dimensionsPlaceholder")}
        />
      </div>
    </div>
  );
}
