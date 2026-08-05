import { Loader2, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { emptyForm, type McpServerForm } from "./form";
import { AdvancedSection, AuthSection } from "./form-sections";
import type { McpServer } from "./types";

export type ServerDialogProps = {
  busy: boolean;
  form: McpServerForm;
  setForm: (form: McpServerForm) => void;
  canManageGlobal?: boolean;
};

export function CreateServerDialog({
  open,
  busy,
  form,
  setForm,
  canManageGlobal,
  showAdvanced,
  onAdvancedChange,
  onOpenChange,
  onCreate,
}: ServerDialogProps & {
  open: boolean;
  showAdvanced: boolean;
  onAdvancedChange: (open: boolean) => void;
  onOpenChange: (open: boolean) => void;
  onCreate: () => void;
}) {
  const t = useTranslations("mcp.serverManager");
  function close() {
    onOpenChange(false);
    setForm(emptyForm);
    onAdvancedChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close();
      }}
    >
      <DialogContent className="max-h-[calc(100svh-2rem)] max-w-lg overflow-x-hidden overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("addTitle")}</DialogTitle>
          <DialogDescription>{t("addDescription")}</DialogDescription>
        </DialogHeader>
        <ServerFormFields form={form} setForm={setForm} />
        {canManageGlobal ? (
          <GlobalScopeField form={form} setForm={setForm} prefix="mcp-create" />
        ) : null}
        <AuthSection
          form={form}
          setForm={setForm}
          transport={form.transport}
          prefix="mcp-create"
        />
        <AdvancedSection
          open={showAdvanced}
          onOpenChange={onAdvancedChange}
          form={form}
          setForm={setForm}
          prefix="mcp-create"
          placeholder={t("advancedCreatePlaceholder")}
        />
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t("cancel")}
          </Button>
          <Button disabled={busy || !form.name.trim()} onClick={onCreate}>
            {busy ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <PlusIcon className="size-4" aria-hidden="true" />
            )}
            {t("addAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ServerFormFields({ form, setForm }: Omit<ServerDialogProps, "busy">) {
  const t = useTranslations("mcp.serverManager");
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="mcp-name">{t("name")}</Label>
        <Input
          id="mcp-name"
          autoComplete="off"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder={t("namePlaceholder")}
        />
      </div>
      {form.transport === "stdio" ? (
        <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
          {t("localModeHint")}
        </div>
      ) : (
        <TransportTargetFields form={form} setForm={setForm} prefix="mcp" />
      )}
    </div>
  );
}

export function GlobalScopeField({
  form,
  setForm,
  prefix,
}: Omit<ServerDialogProps, "busy"> & { prefix: string }) {
  const t = useTranslations("mcp.serverManager");
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
      <Checkbox
        id={`${prefix}-global`}
        checked={form.isGlobal}
        onCheckedChange={(checked) =>
          setForm({ ...form, isGlobal: checked === true })
        }
      />
      <div className="grid gap-1.5 leading-none">
        <Label htmlFor={`${prefix}-global`}>{t("globalLabel")}</Label>
        <p className="text-xs text-muted-foreground">
          {t("globalDescription")}
        </p>
      </div>
    </div>
  );
}

export function TransportTargetFields({
  form,
  setForm,
  prefix,
}: Omit<ServerDialogProps, "busy"> & { prefix: string }) {
  const t = useTranslations("mcp.serverManager");
  if (form.transport === "stdio") {
    return (
      <>
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-command`}>{t("command")}</Label>
          <Input
            id={`${prefix}-command`}
            autoComplete="off"
            value={form.command}
            onChange={(e) => setForm({ ...form, command: e.target.value })}
            placeholder="npx…"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-args`}>{t("argsOnePerLine")}</Label>
          <Textarea
            id={`${prefix}-args`}
            autoComplete="off"
            value={form.args}
            onChange={(e) => setForm({ ...form, args: e.target.value })}
            placeholder={"-y\n@modelcontextprotocol/server-filesystem…"}
          />
        </div>
      </>
    );
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={`${prefix}-url`}>{t("serverUrl")}</Label>
      <Input
        id={`${prefix}-url`}
        type="url"
        autoComplete="off"
        value={form.url}
        onChange={(e) => setForm({ ...form, url: e.target.value })}
        placeholder="https://mcp.example.com…"
      />
    </div>
  );
}
