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
import { CLOUD_TEMPLE_BASE_URL } from "@/modules/provider/cloud-temple-catalog";
import { AddProviderAdvancedFields } from "./provider-dialogs.add-provider-advanced-fields";
import type { ProviderAuthType, ProviderKind } from "./types";

export const FIELD_STACK_CLASS = "grid gap-2";

export type AddProviderDialogProps = {
  open: boolean;
  busy: boolean;
  addKind: ProviderKind;
  addAuthType: ProviderAuthType;
  addName: string;
  addBaseUrl: string;
  addApiKey: string;
  addCustomHeaders: string;
  addQueryParams: string;
  addApiRoute: OpenAICompatibleApiRoute;
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
          <AdvancedSection
            label={tCommon("advanced")}
            hint={t("advancedHint")}
            storageKey="advanced:provider-add"
            defaultOpen={props.addAdvanced}
          >
            <AddProviderAdvancedFields {...props} />
          </AdvancedSection>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button
            disabled={props.busy || !props.addName.trim()}
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
      <div className="rounded-xl border bg-muted/20 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{t("cloudTemplePreset")}</p>
            <p className="text-xs text-muted-foreground">
              {t("cloudTemplePresetHint")}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              props.onKindChange("openai-compatible");
              props.onAuthTypeChange("bearer");
              props.onNameChange("Cloud Temple");
              props.onBaseUrlChange(CLOUD_TEMPLE_BASE_URL);
              props.onApiRouteChange("chat-completions");
            }}
          >
            {t("usePreset")}
          </Button>
        </div>
      </div>
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
    </>
  );
}
