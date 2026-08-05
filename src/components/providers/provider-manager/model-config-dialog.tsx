import { Button } from "@/components/ui/button";
import {
Dialog,
DialogContent,
DialogDescription,
DialogFooter,
DialogHeader,
DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { ProviderModel,ProviderModelUpdate } from "./types";

function optionalNumber(form: FormData, name: string) {
  const value = String(form.get(name) ?? "").trim();
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function ModelConfigDialog({
  model,
  open,
  busy,
  onOpenChange,
  onSave,
}: {
  model: ProviderModel;
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (update: ProviderModelUpdate) => void;
}) {
  const t = useTranslations("providers.manager");
  const image = model.imageGenerationConfigJson ?? {};
  const sustainability = model.sustainabilityConfigJson ?? {};
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const imageEnabled = form.get("imageEnabled") === "on";
            const defaultSize =
              String(form.get("defaultSize") ?? "").trim() || "1024x1024";
            const allowedSizes = String(form.get("allowedSizes") ?? "")
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean);
            onSave({
              displayName: String(form.get("displayName") ?? "").trim(),
              enabled: form.get("enabled") === "on",
              capabilitiesJson: {
                ...(model.capabilitiesJson ?? {}),
                imageGeneration: imageEnabled,
              },
              inputTokenCost: String(form.get("inputTokenCost") ?? "").trim(),
              outputTokenCost: String(form.get("outputTokenCost") ?? "").trim(),
              imageGenerationConfigJson: {
                enabled: imageEnabled,
                isDefault: form.get("isDefault") === "on",
                defaultSize,
                allowedSizes:
                  allowedSizes.length > 0 ? allowedSizes : [defaultSize],
                costPerImage: optionalNumber(form, "costPerImage"),
                energyKwhPerImage: optionalNumber(form, "energyKwhPerImage"),
                co2GramsPerImage: optionalNumber(form, "co2GramsPerImage"),
                currency:
                  String(form.get("currency") ?? "")
                    .trim()
                    .toUpperCase() || "EUR",
              },
              sustainabilityConfigJson: {
                energyKwhPerMillionTokens: optionalNumber(
                  form,
                  "energyKwhPerMillionTokens",
                ),
                co2GramsPerMillionTokens: optionalNumber(
                  form,
                  "co2GramsPerMillionTokens",
                ),
                source: "Administrator override",
                manualOverride: true,
                currency:
                  String(form.get("currency") ?? "")
                    .trim()
                    .toUpperCase() || "EUR",
              },
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("editModel")}</DialogTitle>
            <DialogDescription>{model.modelId}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t("displayName")}
                name="displayName"
                defaultValue={model.displayName ?? model.modelId}
              />
              <Field
                label={t("currency")}
                help={t("currencyHelp")}
                name="currency"
                defaultValue={image.currency ?? "EUR"}
                maxLength={3}
              />
              <Field
                label={t("inputCost")}
                help={t("tokenCostHelp")}
                name="inputTokenCost"
                defaultValue={model.inputTokenCost ?? ""}
                type="number"
              />
              <Field
                label={t("outputCost")}
                help={t("tokenCostHelp")}
                name="outputTokenCost"
                defaultValue={model.outputTokenCost ?? ""}
                type="number"
              />
            </div>
            <div className="flex flex-wrap gap-5 rounded-lg border p-3 text-sm">
              <Check name="enabled" defaultChecked={model.enabled}>
                {t("modelEnabled")}
              </Check>
              <Check
                name="imageEnabled"
                defaultChecked={
                  image.enabled ||
                  model.capabilitiesJson?.imageGeneration === true
                }
              >
                {t("imageGeneration")}
              </Check>
              <Check name="isDefault" defaultChecked={image.isDefault}>
                {t("defaultImageModel")}
              </Check>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t("defaultImageSize")}
                help={t("defaultImageSizeHelp")}
                name="defaultSize"
                defaultValue={image.defaultSize ?? "1024x1024"}
              />
              <Field
                label={t("allowedImageSizes")}
                help={t("allowedImageSizesHelp")}
                name="allowedSizes"
                defaultValue={(image.allowedSizes ?? ["1024x1024"]).join(", ")}
              />
              <Field
                label={t("costPerImage")}
                help={t("impactMetricHelp")}
                name="costPerImage"
                defaultValue={image.costPerImage}
                type="number"
              />
              <Field
                label={t("energyPerImage")}
                help={t("impactMetricHelp")}
                name="energyKwhPerImage"
                defaultValue={image.energyKwhPerImage}
                type="number"
              />
              <Field
                label={t("co2PerImage")}
                help={t("impactMetricHelp")}
                name="co2GramsPerImage"
                defaultValue={image.co2GramsPerImage}
                type="number"
              />
              <Field
                label={t("energyPerMillionTokens")}
                help={t("impactMetricHelp")}
                name="energyKwhPerMillionTokens"
                defaultValue={sustainability.energyKwhPerMillionTokens}
                type="number"
              />
              <Field
                label={t("co2PerMillionTokens")}
                help={t("impactMetricHelp")}
                name="co2GramsPerMillionTokens"
                defaultValue={sustainability.co2GramsPerMillionTokens}
                type="number"
              />
            </div>
            {sustainability.source ? (
              <p className="text-xs text-muted-foreground">
                {t("metricSource", { source: sustainability.source })}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {t("saveModel")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  help,
  name,
  defaultValue,
  type = "text",
  maxLength,
}: {
  label: string;
  help?: string;
  name: string;
  defaultValue?: string | number;
  type?: string;
  maxLength?: number;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`model-${name}`} help={help}>
        {label}
      </Label>
      <Input
        id={`model-${name}`}
        name={name}
        type={type}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "any" : undefined}
        maxLength={maxLength}
        defaultValue={defaultValue}
      />
    </div>
  );
}

function Check({
  name,
  defaultChecked,
  children,
}: {
  name: string;
  defaultChecked?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2">
      <input
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="size-4 accent-primary"
      />
      <span>{children}</span>
    </label>
  );
}
