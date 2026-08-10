import { useTranslations } from "next-intl";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import type { OpenAICompatibleApiRoute } from "@/lib/openai-compatible-api";
import { AUTH_TYPE_LABELS, KIND_LABELS } from "./constants";
import {
  AddProviderDialogProps,
  FIELD_STACK_CLASS,
} from "./provider-dialogs.field-stack-class";
import type { ProviderAuthType, ProviderKind, SafeProvider } from "./types";
import { defaultAuthType } from "./utils";

export function AddProviderAdvancedFields(props: AddProviderDialogProps) {
  const t = useTranslations("providers.manager");
  return (
    <div className="grid gap-4 rounded-xl border bg-muted/20 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={FIELD_STACK_CLASS}>
          <Label htmlFor="add-provider-kind">{t("providerType")}</Label>
          <Select
            value={props.addKind}
            onValueChange={(value) => {
              const kind = value as ProviderKind;
              props.onKindChange(kind);
              props.onAuthTypeChange(defaultAuthType(kind));
            }}
          >
            <SelectTrigger id="add-provider-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(KIND_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className={FIELD_STACK_CLASS}>
          <Label htmlFor="add-provider-auth">{t("authentication")}</Label>
          <Select
            value={props.addAuthType}
            onValueChange={(value) =>
              props.onAuthTypeChange(value as ProviderAuthType)
            }
          >
            <SelectTrigger id="add-provider-auth">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(AUTH_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
      {props.addKind === "openai-compatible" ? (
        <div className={FIELD_STACK_CLASS}>
          <Label htmlFor="add-provider-api-route" help={t("apiRouteHint")}>
            {t("apiRoute")}
          </Label>
          <Select
            value={props.addApiRoute}
            onValueChange={(value) =>
              props.onApiRouteChange(value as OpenAICompatibleApiRoute)
            }
          >
            <SelectTrigger id="add-provider-api-route">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="responses">
                  {t("apiRouteResponses")}
                </SelectItem>
                <SelectItem value="chat-completions">
                  {t("apiRouteChatCompletions")}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("apiRouteHint")}</p>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={FIELD_STACK_CLASS}>
          <Label htmlFor="add-headers">{t("customHeaders")}</Label>
          <Textarea
            id="add-headers"
            name="add-headers"
            autoComplete="off"
            value={props.addCustomHeaders}
            onChange={(e) => props.onCustomHeadersChange(e.target.value)}
            placeholder="X-Team=ai-platform…"
            className="min-h-20 font-mono text-xs"
          />
        </div>
        <div className={FIELD_STACK_CLASS}>
          <Label htmlFor="add-query">{t("queryParams")}</Label>
          <Textarea
            id="add-query"
            name="add-query"
            autoComplete="off"
            value={props.addQueryParams}
            onChange={(e) => props.onQueryParamsChange(e.target.value)}
            placeholder="api-version=2024-10-21…"
            className="min-h-20 font-mono text-xs"
          />
        </div>
      </div>
    </div>
  );
}

export type EditProviderDialogProps = {
  editingProvider: SafeProvider | null;
  busy: boolean;
  editName: string;
  editBaseUrl: string;
  editApiKey: string;
  editApiRoute: OpenAICompatibleApiRoute;
  onClose: () => void;
  onNameChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onApiRouteChange: (value: OpenAICompatibleApiRoute) => void;
  onSave: () => void;
};
