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
import { FIELD_STACK_CLASS } from "./form-sections.field-stack-class";


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
              <Label
                htmlFor={`${prefix}-transport`}
                help={t("connectionModeHelp")}
              >
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
          <Label htmlFor={`${prefix}-headers`} help={t("httpHeadersHint")}>
            {t("httpHeaders")}
          </Label>
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
          <Label htmlFor={`${prefix}-env`} help={t("environmentVariablesHint")}>
            {t("environmentVariables")}
          </Label>
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
