import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select,SelectContent,SelectGroup,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import type { RagConfigFieldsViewModel } from "./page.rag-config-fields.view";
export function RagConfigFieldsSection1({ model }: { model: RagConfigFieldsViewModel }) {
  const { canManageModels, config, discoveringModels, idPrefix, modelValue, onChange, selectModel, t, visionModels } = model;
  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label htmlFor={`${idPrefix}-ocr-enabled`} help={t("ragOcrHint")}>
            {t("ragOcrEnabled")}
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">{t("ragOcrHint")}</p>
        </div>
        <Checkbox
          id={`${idPrefix}-ocr-enabled`}
          checked={config.extraction.ocr.enabled}
          onCheckedChange={(checked) =>
            onChange({
              ...config,
              extraction: {
                ...config.extraction,
                ocr: {
                  ...config.extraction.ocr,
                  enabled: checked === true,
                },
              },
            })
          }
        />
      </div>
      {config.extraction.ocr.enabled ? (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))]">
          {canManageModels ? (
            <div className="col-span-full grid min-w-0 gap-1.5">
              <Label htmlFor={`${idPrefix}-ocr-model`} help={t("ragOcrModelHelp")}>
                {t("ragOcrModel")}
              </Label>
              <Select onValueChange={(value) => selectModel(value, "ocr")}>
                <SelectTrigger id={`${idPrefix}-ocr-model`} className="min-w-0">
                  <SelectValue placeholder={discoveringModels ? t("ragDiscoveringModels") : t("ragSelectVisionModel")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {visionModels.map((model) => (
                      <SelectItem key={`ocr-${modelValue(model)}`} value={modelValue(model)}>
                        {model.providerName} · {model.displayName || model.modelId}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Input
                aria-label={t("ragExactOcrModelId")}
                value={config.extraction.ocr.modelId}
                onChange={(event) =>
                  onChange({
                    ...config,
                    extraction: {
                      ...config.extraction,
                      ocr: {
                        ...config.extraction.ocr,
                        providerId: null,
                        modelId: event.target.value,
                      },
                    },
                  })
                }
                placeholder={t("ragExactOcrModelId")}
              />
            </div>
          ) : (
            <p className="col-span-full text-xs text-muted-foreground">{config.extraction.ocr.modelId || t("ragInheritedModel")}</p>
          )}
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={`${idPrefix}-ocr-min-text`} help={t("ragOcrMinimumTextHelp")}>
              {t("ragOcrMinimumText")}
            </Label>
            <Input
              id={`${idPrefix}-ocr-min-text`}
              type="number"
              min={0}
              max={10000}
              value={config.extraction.ocr.minimumTextCharactersPerPage}
              onChange={(event) =>
                onChange({
                  ...config,
                  extraction: {
                    ...config.extraction,
                    ocr: {
                      ...config.extraction.ocr,
                      minimumTextCharactersPerPage: Number(event.target.value),
                    },
                  },
                })
              }
            />
          </div>
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={`${idPrefix}-ocr-max-pages`} help={t("ragOcrMaxPagesHelp")}>
              {t("ragOcrMaxPages")}
            </Label>
            <Input
              id={`${idPrefix}-ocr-max-pages`}
              type="number"
              min={1}
              max={500}
              value={config.extraction.ocr.maxVisualPages}
              onChange={(event) =>
                onChange({
                  ...config,
                  extraction: {
                    ...config.extraction,
                    ocr: {
                      ...config.extraction.ocr,
                      maxVisualPages: Number(event.target.value),
                    },
                  },
                })
              }
            />
          </div>
          <div className="col-span-full flex min-w-0 items-center justify-between gap-3 rounded-lg border p-3">
            <Label htmlFor={`${idPrefix}-ocr-diagrams`} help={t("ragOcrDescribeDiagramsHelp")}>
              {t("ragOcrDescribeDiagrams")}
            </Label>
            <Checkbox
              id={`${idPrefix}-ocr-diagrams`}
              checked={config.extraction.ocr.describeDiagrams}
              onCheckedChange={(checked) =>
                onChange({
                  ...config,
                  extraction: {
                    ...config.extraction,
                    ocr: {
                      ...config.extraction.ocr,
                      describeDiagrams: checked === true,
                    },
                  },
                })
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
