import { ChevronDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { McpServerForm } from "./form";
import type { SimpleAuthMode } from "./types";

const FIELD_STACK_CLASS = "grid gap-2";

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
        <Label htmlFor={`${prefix}-auth-mode`}>{t("authentication")}</Label>
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

export function AdvancedSection({
  open,
  onOpenChange,
  form,
  setForm,
  prefix,
  placeholder,
  showConnectionMode = true,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  form: McpServerForm;
  setForm: (f: McpServerForm) => void;
  prefix: string;
  placeholder: string;
  showConnectionMode?: boolean;
}) {
  const t = useTranslations("mcp.serverManager");
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className="min-w-0 overflow-hidden rounded-lg border border-border/70 bg-muted/20"
    >
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="flex w-full justify-between px-3 py-2 text-sm"
        >
          <span>{t("advancedOptions")}</span>
          <ChevronDownIcon
            className={cn("size-4 transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="grid min-w-0 gap-4 border-t border-border/60 p-3">
        <p className="text-xs text-muted-foreground">{placeholder}</p>
        {showConnectionMode ? (
          <div className="grid gap-3 rounded-lg border border-border/60 bg-background/60 p-3">
            <div className={FIELD_STACK_CLASS}>
              <Label htmlFor={`${prefix}-transport`}>
                {t("connectionMode")}
              </Label>
              <Select
                value={form.transport}
                onValueChange={(value) =>
                  setForm({ ...form, transport: value, authMode: "none" })
                }
              >
                <SelectTrigger id={`${prefix}-transport`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="streamable-http">
                    {t("httpServer")}
                  </SelectItem>
                  <SelectItem value="sse">{t("sseServer")}</SelectItem>
                  <SelectItem value="stdio">{t("localCommand")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.transport === "stdio" ? (
              <>
                <div className={FIELD_STACK_CLASS}>
                  <Label htmlFor={`${prefix}-command`}>{t("command")}</Label>
                  <Input
                    id={`${prefix}-command`}
                    autoComplete="off"
                    value={form.command}
                    onChange={(e) =>
                      setForm({ ...form, command: e.target.value })
                    }
                    placeholder="npx…"
                  />
                </div>
                <div className={FIELD_STACK_CLASS}>
                  <Label htmlFor={`${prefix}-args`}>{t("args")}</Label>
                  <Textarea
                    id={`${prefix}-args`}
                    autoComplete="off"
                    value={form.args}
                    onChange={(e) => setForm({ ...form, args: e.target.value })}
                    placeholder={"-y\n@modelcontextprotocol/server-filesystem…"}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("oneArgumentPerLine")}
                  </p>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
        <div className="flex min-w-0 items-center justify-between gap-4 rounded-lg border border-border/60 bg-background/60 p-3">
          <div>
            <p className="text-sm font-medium">{t("requireApproval")}</p>
            <p className="text-xs text-muted-foreground">
              {t("requireApprovalDescription")}
            </p>
          </div>
          <Switch
            aria-label={t("requireApprovalAria")}
            checked={form.requireApproval}
            onCheckedChange={(checked) =>
              setForm({ ...form, requireApproval: checked })
            }
          />
        </div>
        <div className={FIELD_STACK_CLASS}>
          <Label htmlFor={`${prefix}-headers`}>{t("httpHeaders")}</Label>
          <Textarea
            id={`${prefix}-headers`}
            autoComplete="off"
            value={form.headers}
            onChange={(e) => setForm({ ...form, headers: e.target.value })}
            placeholder="Authorization=Bearer sk-…"
          />
          <p className="text-xs text-muted-foreground">
            {t("httpHeadersHint")}
          </p>
        </div>
        <div className={FIELD_STACK_CLASS}>
          <Label htmlFor={`${prefix}-env`}>{t("environmentVariables")}</Label>
          <Textarea
            id={`${prefix}-env`}
            autoComplete="off"
            value={form.env}
            onChange={(e) => setForm({ ...form, env: e.target.value })}
            placeholder="API_KEY=…"
          />
          <p className="text-xs text-muted-foreground">
            {t("environmentVariablesHint")}
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
