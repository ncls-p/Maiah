import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { emptyBedrock } from "./bedrock-fields";
import { KIND_LABELS } from "./constants";
import { defaultAuthType } from "./utils";
import type { AddProviderDialogProps } from "./provider-dialogs.field-stack-class";
import type { ProviderKind } from "./types";
export function ProviderPresets(props: AddProviderDialogProps) {
  const t = useTranslations("providers.manager");
  return (
    <div className="grid gap-3 rounded-xl border bg-muted/20 p-4">
      <p className="text-sm font-medium">{t("chooseService")}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          {
            name: "OpenAI",
            kind: "openai-compatible",
            url: "https://api.openai.com/v1",
          },
          {
            name: "Anthropic",
            kind: "anthropic-compatible",
            url: "https://api.anthropic.com/v1",
          },
          { name: "Amazon Bedrock", kind: "amazon-bedrock", url: "" },
          {
            name: "Cloud Temple",
            kind: "openai-compatible",
            url: "https://api.ai.cloud-temple.com/v1",
          },
          {
            name: "Vercel AI Gateway",
            kind: "vercel-ai-gateway",
            url: "https://ai-gateway.vercel.sh/v1",
          },
          { name: t("otherService"), kind: "openai-compatible", url: "" },
        ].map((preset) => (
          <Button
            key={preset.name}
            type="button"
            variant={props.addName === preset.name ? "secondary" : "outline"}
            className="h-auto min-h-10 whitespace-normal text-left text-xs"
            onClick={() => {
              props.onKindChange(preset.kind as ProviderKind);
              props.onAuthTypeChange(
                defaultAuthType(preset.kind as ProviderKind),
              );
              props.onNameChange(
                preset.name === t("otherService") ? "" : preset.name,
              );
              props.onBaseUrlChange(preset.url);
              props.onBedrockChange({ ...emptyBedrock });
              props.onApiKeyChange("");
              props.onCustomHeadersChange("");
              props.onQueryParamsChange("");
              props.onApiRouteChange(
                preset.name === "Cloud Temple"
                  ? "chat-completions"
                  : "responses",
              );
            }}
          >
            {preset.name}
          </Button>
        ))}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="add-provider-kind">{t("providerType")}</Label>
        <Select
          value={props.addKind}
          onValueChange={(v) => {
            props.onBaseUrlChange("");
            props.onCustomHeadersChange("");
            props.onQueryParamsChange("");
            props.onCompatibilityProfileChange("auto");
            props.onKindChange(v as ProviderKind);
            props.onAuthTypeChange(defaultAuthType(v as ProviderKind));
            props.onBedrockChange({ ...emptyBedrock });
            props.onApiKeyChange("");
          }}
        >
          <SelectTrigger id="add-provider-kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(KIND_LABELS)
              .filter(([key]) => key !== "native")
              .map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
