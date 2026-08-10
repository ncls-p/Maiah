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
export function RagSettingsFieldsSection1({
  model,
}: {
  model: RagSettingsViewModel;
}) {
  const {
    discovering,
    modelValue,
    numberValue,
    selectModel,
    setSettings,
    settings,
    t,
    visionModels,
  } = model;
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="rag-ocr" help={t("ocrHint")}>
            {t("ocr")}
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">{t("ocrHint")}</p>
        </div>
        <Switch
          id="rag-ocr"
          checked={settings.extraction.ocr.enabled}
          onCheckedChange={(enabled) =>
            setSettings({
              ...settings,
              extraction: {
                ...settings.extraction,
                ocr: { ...settings.extraction.ocr, enabled },
              },
            })
          }
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t("anydocHint")}</p>
      {settings.extraction.ocr.enabled ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="rag-discovered-ocr-model" help={t("ocrModelHelp")}>
              {t("discoveredOcrModel")}
            </Label>
            <Select onValueChange={(value) => selectModel(value, "ocr")}>
              <SelectTrigger id="rag-discovered-ocr-model">
                <SelectValue
                  placeholder={
                    discovering
                      ? t("discoveringModels")
                      : t("selectVisionModel")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {visionModels.map((model) => (
                    <SelectItem
                      key={`ocr-${modelValue(model)}`}
                      value={modelValue(model)}
                    >
                      {model.providerName} ·{" "}
                      {model.displayName || model.modelId}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Label htmlFor="rag-ocr-model" help={t("ocrModelHelp")}>
              {t("ocrModel")}
            </Label>
            <Input
              id="rag-ocr-model"
              value={settings.extraction.ocr.modelId}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  extraction: {
                    ...settings.extraction,
                    ocr: {
                      ...settings.extraction.ocr,
                      providerId: null,
                      modelId: event.target.value,
                    },
                  },
                })
              }
              placeholder={t("modelPlaceholder")}
            />
          </div>
          <div className="grid gap-1.5">
            <Label
              htmlFor="rag-ocr-minimum-text"
              help={t("ocrMinimumTextHelp")}
            >
              {t("ocrMinimumText")}
            </Label>
            <Input
              id="rag-ocr-minimum-text"
              type="number"
              min={0}
              max={10000}
              value={settings.extraction.ocr.minimumTextCharactersPerPage}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  extraction: {
                    ...settings.extraction,
                    ocr: {
                      ...settings.extraction.ocr,
                      minimumTextCharactersPerPage: numberValue(
                        event.target.value,
                        settings.extraction.ocr.minimumTextCharactersPerPage,
                      ),
                    },
                  },
                })
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rag-ocr-max-pages" help={t("ocrMaxPagesHelp")}>
              {t("ocrMaxPages")}
            </Label>
            <Input
              id="rag-ocr-max-pages"
              type="number"
              min={1}
              max={500}
              value={settings.extraction.ocr.maxVisualPages}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  extraction: {
                    ...settings.extraction,
                    ocr: {
                      ...settings.extraction.ocr,
                      maxVisualPages: numberValue(
                        event.target.value,
                        settings.extraction.ocr.maxVisualPages,
                      ),
                    },
                  },
                })
              }
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3 sm:col-span-2">
            <Label
              htmlFor="rag-ocr-diagrams"
              help={t("ocrDescribeDiagramsHelp")}
            >
              {t("ocrDescribeDiagrams")}
            </Label>
            <Switch
              id="rag-ocr-diagrams"
              checked={settings.extraction.ocr.describeDiagrams}
              onCheckedChange={(describeDiagrams) =>
                setSettings({
                  ...settings,
                  extraction: {
                    ...settings.extraction,
                    ocr: {
                      ...settings.extraction.ocr,
                      describeDiagrams,
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
