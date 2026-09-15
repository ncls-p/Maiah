import { BedrockFields, type BedrockDraft } from "./bedrock-fields";
import { ProviderPresets } from "./provider-presets";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { AdvancedSection } from "@/components/ui/advanced-section";

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

import type { OpenAICompatibleApiRoute } from "@/lib/openai-compatible-api";
import type { OpenAICompatibilityProfile } from "@/lib/openai-compatibility-profile";
import { AddProviderAdvancedFields } from "./provider-dialogs.add-provider-advanced-fields";
import type { ProviderAuthType, ProviderKind } from "./types";

export const FIELD_STACK_CLASS = "grid gap-2";

export type AddProviderDialogProps = {
  open: boolean;
  busy: boolean;
  addKind: ProviderKind;
  addBedrock: BedrockDraft;
  onBedrockChange: (value: BedrockDraft) => void;
  addAuthType: ProviderAuthType;
  addName: string;
  addBaseUrl: string;
  addApiKey: string;
  addCustomHeaders: string;
  addQueryParams: string;
  addApiRoute: OpenAICompatibleApiRoute;
  addCompatibilityProfile: OpenAICompatibilityProfile;
  addAdvanced: boolean;
  onOpenChange: (open: boolean) => void;
  onKindChange: (kind: ProviderKind) => void;
  onAuthTypeChange: (authType: ProviderAuthType) => void;
  onNameChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onCustomHeadersChange: (value: string) => void;
  onQueryParamsChange: (value: string) => void;
  onApiRouteChange: (value: OpenAICompatibleApiRoute) => void;
  onCompatibilityProfileChange: (value: OpenAICompatibilityProfile) => void;
  onAdvancedChange: (value: boolean) => void;
  onCreateProvider: () => void;
};

export function AddProviderDialog(props: AddProviderDialogProps) {
  const t = useTranslations("providers");
  const tm = useTranslations("providers.manager");
  const tCommon = useTranslations("common");
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("add")}</DialogTitle>
          <DialogDescription>{tm("addDialogDescription")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <AddProviderBasicFields {...props} />
          {props.addKind !== "amazon-bedrock" ? (
            <AdvancedSection
              label={tCommon("advanced")}
              hint={t("advancedHint")}
              storageKey="advanced:provider-add"
              defaultOpen={props.addAdvanced}
            >
              <AddProviderAdvancedFields {...props} />
            </AdvancedSection>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button
            disabled={
              props.busy ||
              !props.addName.trim() ||
              (props.addKind === "amazon-bedrock" &&
                (!props.addBedrock.region.trim() ||
                  (props.addBedrock.authMode === "api-key"
                    ? !props.addApiKey.trim()
                    : !props.addBedrock.accessKeyId.trim() ||
                      !props.addBedrock.secretAccessKey.trim())))
            }
            onClick={props.onCreateProvider}
          >
            {props.busy ? (
              <Loader2Icon className="animate-spin" aria-hidden="true" />
            ) : (
              <PlusIcon className="size-4" aria-hidden="true" />
            )}
            {tm("connectProvider")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddProviderBasicFields(props: AddProviderDialogProps) {
  const t = useTranslations("providers.manager");
  return (
    <>
      <ProviderPresets {...props} />
      <div className={FIELD_STACK_CLASS}>
        <Label htmlFor="add-provider-name">{t("providerName")}</Label>
        <Input
          id="add-provider-name"
          name="add-provider-name"
          autoComplete="off"
          value={props.addName}
          onChange={(e) => props.onNameChange(e.target.value)}
          placeholder={t("providerNamePlaceholder")}
        />
      </div>
      {props.addKind === "amazon-bedrock" ? (
        <BedrockFields
          value={props.addBedrock}
          onChange={props.onBedrockChange}
        />
      ) : (
        <div className={FIELD_STACK_CLASS}>
          <Label htmlFor="add-provider-url" help={t("serviceUrlHint")}>
            {t("serviceUrl")}
          </Label>
          <Input
            id="add-provider-url"
            name="add-provider-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            value={props.addBaseUrl}
            onChange={(e) => props.onBaseUrlChange(e.target.value)}
            placeholder={t("serviceUrlPlaceholder")}
          />
          <p className="text-xs text-muted-foreground">{t("serviceUrlHint")}</p>
        </div>
      )}
      {props.addKind !== "amazon-bedrock" ||
      props.addBedrock.authMode === "api-key" ? (
        <div className={FIELD_STACK_CLASS}>
          <Label htmlFor="add-provider-key">{t("apiKey")}</Label>
          <Input
            id="add-provider-key"
            name="add-provider-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={props.addApiKey}
            onChange={(e) => props.onApiKeyChange(e.target.value)}
            placeholder="sk-…"
          />
        </div>
      ) : null}
    </>
  );
}
