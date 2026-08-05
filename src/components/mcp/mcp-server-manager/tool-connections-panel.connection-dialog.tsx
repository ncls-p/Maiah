"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
Dialog,
DialogContent,
DialogDescription,
DialogFooter,
DialogHeader,
DialogTitle,
} from "@/components/ui/dialog";
import {
Field,
FieldDescription,
FieldGroup,
FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
Select,
SelectContent,
SelectItem,
SelectTrigger,
SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import { schemaFields } from "./tool-connections-panel.initial-values";
import { ConnectionFormState,FieldValue,ToolConnectionOwnerType,ToolConnectionStatus,ToolConnector } from "./tool-connections-panel.json-record";
import { SchemaFieldControl } from "./tool-connections-panel.schema-field-control";


export function ConnectionDialog({
  open,
  busy,
  form,
  connector,
  canManageWorkspaceConnections,
  onOpenChangeAction,
  onFormChangeAction,
  onSaveAction,
}: {
  open: boolean;
  busy: boolean;
  form: ConnectionFormState | null;
  connector: ToolConnector | null;
  canManageWorkspaceConnections: boolean;
  onOpenChangeAction: (open: boolean) => void;
  onFormChangeAction: (form: ConnectionFormState | null) => void;
  onSaveAction: () => void;
}) {
  const t = useTranslations("mcp.toolConnections");
  const configSchema = connector?.configSchema ?? null;
  const secretSchema = connector?.secretSchema ?? null;
  const configFields = schemaFields(configSchema);
  const secretFields = schemaFields(secretSchema);
  const editing = Boolean(form?.id);

  function updateForm(patch: Partial<ConnectionFormState>) {
    if (!form) return;
    onFormChangeAction({ ...form, ...patch });
  }

  function updateConfig(key: string, value: FieldValue) {
    if (!form) return;
    onFormChangeAction({
      ...form,
      config: { ...form.config, [key]: value },
    });
  }

  function updateSecret(key: string, value: string) {
    if (!form) return;
    onFormChangeAction({
      ...form,
      secrets: { ...form.secrets, [key]: value },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent className="max-h-[min(820px,calc(100vh-2rem))] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? t("editConnectionTitle", {
                  name: connector?.name ?? t("toolFallback"),
                })
              : t("addConnectionTitle", {
                  name: connector?.name ?? t("toolFallback"),
                })}
          </DialogTitle>
          <DialogDescription>{t("dialogDescription")}</DialogDescription>
        </DialogHeader>

        {form && connector ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="tool-connection-label">
                {t("label")}
              </FieldLabel>
              <Input
                id="tool-connection-label"
                value={form.label}
                onChange={(event) => updateForm({ label: event.target.value })}
                placeholder={t("labelPlaceholder", { name: connector.name })}
              />
              <FieldDescription>{t("labelDescription")}</FieldDescription>
            </Field>

            {canManageWorkspaceConnections ? (
              <Field>
                <FieldLabel>{t("scope")}</FieldLabel>
                <Select
                  value={form.ownerType}
                  onValueChange={(value) =>
                    updateForm({ ownerType: value as ToolConnectionOwnerType })
                  }
                  disabled={editing}
                >
                  <SelectTrigger className="w-full" aria-label={t("scope")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">
                      {t("personalConnection")}
                    </SelectItem>
                    <SelectItem value="workspace">
                      {t("workspaceDefault")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FieldDescription>{t("scopeDescription")}</FieldDescription>
              </Field>
            ) : null}

            {configFields.length > 0 ? (
              <div className="flex flex-col gap-4 rounded-xl border p-4">
                <div>
                  <p className="font-medium">{t("configuration")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("configurationDescription")}
                  </p>
                </div>
                {configFields.map(({ key, property, required }) => (
                  <SchemaFieldControl
                    key={key}
                    id={`tool-connection-config-${key}`}
                    fieldKey={key}
                    property={property}
                    required={required}
                    value={form.config[key]}
                    onChangeAction={(value) => updateConfig(key, value)}
                  />
                ))}
              </div>
            ) : null}

            {secretFields.length > 0 ? (
              <div className="flex flex-col gap-4 rounded-xl border p-4">
                <div>
                  <p className="font-medium">{t("secrets")}</p>
                  <p className="text-sm text-muted-foreground">
                    {editing && form.hasExistingSecrets
                      ? t("secretsExistingDescription")
                      : t("secretsDescription")}
                  </p>
                </div>
                {secretFields.map(({ key, property, required }) => (
                  <SchemaFieldControl
                    key={key}
                    id={`tool-connection-secret-${key}`}
                    fieldKey={key}
                    property={{ ...property, type: "password" }}
                    required={
                      required && (!editing || !form.hasExistingSecrets)
                    }
                    value={form.secrets[key] ?? ""}
                    placeholder={
                      editing && form.hasExistingSecrets
                        ? t("secretSavedPlaceholder")
                        : undefined
                    }
                    onChangeAction={(value) => updateSecret(key, String(value))}
                  />
                ))}
              </div>
            ) : null}

            <Field
              orientation="horizontal"
              className="items-center justify-between rounded-xl border p-4"
            >
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor="tool-connection-default">
                  {t("useAsDefault")}
                </FieldLabel>
                <FieldDescription>
                  {t("useAsDefaultDescription")}
                </FieldDescription>
              </div>
              <Switch
                id="tool-connection-default"
                checked={form.isDefault}
                onCheckedChange={(checked) =>
                  updateForm({ isDefault: checked })
                }
              />
            </Field>

            {editing ? (
              <Field>
                <FieldLabel>{t("statusLabel")}</FieldLabel>
                <Select
                  value={form.status}
                  onValueChange={(value) =>
                    updateForm({ status: value as ToolConnectionStatus })
                  }
                >
                  <SelectTrigger
                    className="w-full"
                    aria-label={t("statusLabel")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t("status.active")}</SelectItem>
                    <SelectItem value="disabled">
                      {t("status.disabled")}
                    </SelectItem>
                    <SelectItem value="invalid">
                      {t("status.invalid")}
                    </SelectItem>
                    <SelectItem value="expired">
                      {t("status.expired")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
          </FieldGroup>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChangeAction(false)}
            disabled={busy}
          >
            {t("cancel")}
          </Button>
          <Button onClick={onSaveAction} disabled={busy || !form || !connector}>
            {busy ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
