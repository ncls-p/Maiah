import { Loader2 } from "lucide-react";
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

import {
  GlobalScopeField,
  ServerDialogProps,
  TransportTargetFields,
} from "./dialogs.server-dialog-props";
import { AdvancedSection, AuthSection } from "./form-sections";
import type { McpServer } from "./types";

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
  resourceAccessOptions,
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
            {resourceAccessOptions ? (
              <GlobalScopeField
                form={form}
                setForm={setForm}
                resourceAccessOptions={resourceAccessOptions}
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
