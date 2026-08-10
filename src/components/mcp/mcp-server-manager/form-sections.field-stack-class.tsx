import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { McpServerForm } from "./form";
import type { SimpleAuthMode } from "./types";

export const FIELD_STACK_CLASS = "grid gap-2";

export function AuthSection({
  form,
  setForm,
  transport,
  prefix,
  isEdit = false,
}: {
  form: McpServerForm;
  setForm: (f: McpServerForm) => void;
  transport: string;
  prefix: string;
  isEdit?: boolean;
}) {
  const t = useTranslations("mcp.serverManager");
  const showCustomHint = form.authMode === "custom";
  const secretPlaceholder = (fallback: string) =>
    isEdit ? t("keepCurrentSecret") : fallback;

  return (
    <div className="grid min-w-0 gap-3 rounded-lg border border-border/70 bg-background/70 p-3">
      <div className="grid min-w-0 gap-2">
        <Label htmlFor={`${prefix}-auth-mode`} help={t("authenticationHelp")}>
          {t("authentication")}
        </Label>
        <Select
          value={form.authMode === "custom" ? "custom" : form.authMode}
          onValueChange={(value) =>
            setForm({ ...form, authMode: value as SimpleAuthMode })
          }
        >
          <SelectTrigger id={`${prefix}-auth-mode`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {form.authMode === "custom" ? (
              <SelectItem value="custom">{t("authCustom")}</SelectItem>
            ) : null}
            <SelectItem value="none">{t("authNone")}</SelectItem>
            {transport === "stdio" ? (
              <SelectItem value="env">{t("authToken")}</SelectItem>
            ) : (
              <>
                <SelectItem value="bearer">{t("authBearer")}</SelectItem>
                <SelectItem value="api-key">{t("authApiKey")}</SelectItem>
              </>
            )}
          </SelectContent>
        </Select>
      </div>
      {showCustomHint ? (
        <p className="text-xs text-muted-foreground">
          {t("customCredentialsHint")}
        </p>
      ) : null}
      {transport === "stdio" && form.authMode === "env" ? (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]">
          <div className={FIELD_STACK_CLASS}>
            <Label htmlFor={`${prefix}-env-key-name`}>
              {t("variableName")}
            </Label>
            <Input
              id={`${prefix}-env-key-name`}
              autoComplete="off"
              value={form.envKeyName}
              onChange={(e) => setForm({ ...form, envKeyName: e.target.value })}
              placeholder="API_KEY"
            />
          </div>
          <div className={FIELD_STACK_CLASS}>
            <Label htmlFor={`${prefix}-env-key-value`}>
              {t("secretValue")}
            </Label>
            <Input
              id={`${prefix}-env-key-value`}
              type="password"
              autoComplete="off"
              value={form.envKeyValue}
              onChange={(e) =>
                setForm({ ...form, envKeyValue: e.target.value })
              }
              placeholder={secretPlaceholder(t("pasteToken"))}
            />
          </div>
        </div>
      ) : null}
      {transport !== "stdio" && form.authMode === "bearer" ? (
        <div className={FIELD_STACK_CLASS}>
          <Label htmlFor={`${prefix}-bearer-token`}>{t("authBearer")}</Label>
          <Input
            id={`${prefix}-bearer-token`}
            type="password"
            autoComplete="off"
            value={form.bearerToken}
            onChange={(e) => setForm({ ...form, bearerToken: e.target.value })}
            placeholder={secretPlaceholder(t("pasteToken"))}
          />
        </div>
      ) : null}
      {transport !== "stdio" && form.authMode === "api-key" ? (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]">
          <div className={FIELD_STACK_CLASS}>
            <Label htmlFor={`${prefix}-api-key-header`}>
              {t("headerName")}
            </Label>
            <Input
              id={`${prefix}-api-key-header`}
              autoComplete="off"
              value={form.apiKeyHeader}
              onChange={(e) =>
                setForm({ ...form, apiKeyHeader: e.target.value })
              }
              placeholder="X-API-Key"
            />
          </div>
          <div className={FIELD_STACK_CLASS}>
            <Label htmlFor={`${prefix}-api-key-value`}>{t("apiKey")}</Label>
            <Input
              id={`${prefix}-api-key-value`}
              type="password"
              autoComplete="off"
              value={form.apiKeyValue}
              onChange={(e) =>
                setForm({ ...form, apiKeyValue: e.target.value })
              }
              placeholder={secretPlaceholder(t("pasteKey"))}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
