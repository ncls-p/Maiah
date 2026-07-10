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

type ServerDialogProps = {
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

function GlobalScopeField({
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

function TransportTargetFields({
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

function ConnectionFields({
  form,
  setForm,
  prefix,
  showTransportSelector,
}: Omit<ServerDialogProps, "busy"> & {
  prefix: string;
  showTransportSelector: boolean;
}) {
  const t = useTranslations("mcp.serverManager");
  return (
    <div className="grid min-w-0 gap-4">
      {showTransportSelector ? (
        <div className="grid min-w-0 gap-2">
          <Label htmlFor={`${prefix}-transport`}>{t("connectionMode")}</Label>
          <Select
            value={form.transport}
            onValueChange={(value) =>
              setForm({ ...form, transport: value, authMode: "none" })
            }
          >
            <SelectTrigger id={`${prefix}-transport`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="streamable-http">{t("httpServer")}</SelectItem>
              <SelectItem value="sse">{t("sseServer")}</SelectItem>
              <SelectItem value="stdio">{t("localCommand")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <TransportTargetFields form={form} setForm={setForm} prefix={prefix} />
    </div>
  );
}

export function EditServerDialog({
  server,
  busy,
  loading,
  canManageGlobal,
  form,
  setForm,
  showAdvanced,
  onAdvancedChange,
  onClose,
  onSave,
}: ServerDialogProps & {
  server: McpServer | null;
  loading: boolean;
  showAdvanced: boolean;
  onAdvancedChange: (open: boolean) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const t = useTranslations("mcp.serverManager");
  const fieldsDisabled = busy || loading;

  return (
    <Dialog
      open={Boolean(server)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100svh-2rem)] max-w-lg overflow-x-hidden overflow-y-auto">
        <DialogHeader className="min-w-0">
          <DialogTitle>{t("editTitle")}</DialogTitle>
          <DialogDescription>
            {t("editDescription", { name: server?.name ?? "" })}
          </DialogDescription>
          {server?.hasHeaders || server?.hasEnv ? (
            <Badge variant="secondary" className="w-fit">
              {t("credentialsConfigured")}
            </Badge>
          ) : null}
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {t("loadingConfiguration")}
          </div>
        ) : (
          <div className="grid min-w-0 gap-4">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="mcp-edit-name">{t("name")}</Label>
              <Input
                id="mcp-edit-name"
                autoComplete="off"
                value={form.name}
                disabled={fieldsDisabled}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <ConnectionFields
              form={form}
              setForm={setForm}
              prefix="mcp-edit"
              showTransportSelector
            />
            {canManageGlobal ? (
              <GlobalScopeField
                form={form}
                setForm={setForm}
                prefix="mcp-edit"
              />
            ) : null}
            <AuthSection
              form={form}
              setForm={setForm}
              transport={form.transport}
              prefix="mcp-edit"
              isEdit
            />
            <AdvancedSection
              open={showAdvanced}
              onOpenChange={onAdvancedChange}
              form={form}
              setForm={setForm}
              prefix="mcp-edit"
              placeholder={t("advancedEditPlaceholder")}
              showConnectionMode={false}
            />
          </div>
        )}
        <DialogFooter className="overflow-hidden">
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button disabled={fieldsDisabled || loading} onClick={onSave}>
            {t("saveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteServerDialog({
  deleteId,
  busy,
  onClose,
  onDelete,
}: {
  deleteId: string | null;
  busy: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations("mcp.serverManager");
  return (
    <AlertDialog open={Boolean(deleteId)} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("removeTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("removeDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={() => deleteId && onDelete(deleteId)}
          >
            {busy ? t("removing") : t("remove")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
