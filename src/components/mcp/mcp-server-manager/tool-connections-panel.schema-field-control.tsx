"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import {
Field,
FieldDescription,
FieldLabel
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
Select,
SelectContent,
SelectItem,
SelectTrigger,
SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { humanizeKey,initialSecretValues,initialValues,placeholderFor } from "./tool-connections-panel.initial-values";
import { ConnectionFormState,DEFAULT_STATUS,FieldValue,JsonRecord,SERVICE_NOW_PACKAGE_LABELS,SchemaProperty,ToolConnection,ToolConnectionStatus,ToolConnector } from "./tool-connections-panel.json-record";
import type { McpServer } from "./types";


export function SchemaFieldControl({
  id,
  fieldKey,
  property,
  required,
  value,
  placeholder,
  onChangeAction,
}: {
  id: string;
  fieldKey: string;
  property: SchemaProperty;
  required: boolean;
  value: FieldValue | undefined;
  placeholder?: string;
  onChangeAction: (value: FieldValue) => void;
}) {
  const t = useTranslations("mcp.toolConnections");
  const label = t.has(`fields.${fieldKey}`)
    ? t(`fields.${fieldKey}`)
    : property.title || humanizeKey(fieldKey);
  const description = property.description;
  const isBoolean = property.type === "boolean";
  const isPassword =
    property.type === "password" || property.format === "password";
  const inputType = isPassword
    ? "password"
    : property.format === "uri"
      ? "url"
      : "text";

  return (
    <Field orientation={isBoolean ? "horizontal" : "vertical"}>
      {isBoolean ? (
        <>
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor={id}>
              {label}
              {required ? " *" : ""}
            </FieldLabel>
            {description ? (
              <FieldDescription>{description}</FieldDescription>
            ) : null}
          </div>
          <Switch
            id={id}
            checked={Boolean(value)}
            onCheckedChange={onChangeAction}
          />
        </>
      ) : property.enum?.length ? (
        <>
          <FieldLabel>
            {label}
            {required ? " *" : ""}
          </FieldLabel>
          <Select
            value={typeof value === "string" ? value : ""}
            onValueChange={onChangeAction}
          >
            <SelectTrigger className="w-full" aria-label={label}>
              <SelectValue placeholder={t("selectField", { field: label })} />
            </SelectTrigger>
            <SelectContent>
              {property.enum.map((option) => (
                <SelectItem key={option} value={option}>
                  {t.has(`packages.${option}`)
                    ? t(`packages.${option}`)
                    : (SERVICE_NOW_PACKAGE_LABELS[option] ??
                      humanizeKey(option))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description ? (
            <FieldDescription>{description}</FieldDescription>
          ) : null}
        </>
      ) : (
        <>
          <FieldLabel htmlFor={id}>
            {label}
            {required ? " *" : ""}
          </FieldLabel>
          <Input
            id={id}
            type={inputType}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChangeAction(event.target.value)}
            placeholder={placeholder || placeholderFor(fieldKey, property)}
            autoComplete={isPassword ? "new-password" : "off"}
          />
          {description ? (
            <FieldDescription>{description}</FieldDescription>
          ) : null}
        </>
      )}
    </Field>
  );
}

export function StatusBadge({ status }: { status: ToolConnectionStatus }) {
  const t = useTranslations("mcp.toolConnections");
  return (
    <Badge
      variant={status === "active" ? "secondary" : "outline"}
      className={cn(status !== "active" && "text-muted-foreground")}
    >
      {t(`status.${status}`)}
    </Badge>
  );
}

export function ConnectionConfigSummary({ config }: { config: JsonRecord | null }) {
  const t = useTranslations("mcp.toolConnections");
  const instanceUrl =
    typeof config?.instanceUrl === "string" ? config.instanceUrl : null;
  const packageName =
    typeof config?.toolPackage === "string" ? config.toolPackage : null;
  const authType =
    typeof config?.authType === "string" ? config.authType : null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
      {instanceUrl ? <span className="truncate">{instanceUrl}</span> : null}
      {authType ? (
        <span>{t("authSummary", { value: humanizeKey(authType) })}</span>
      ) : null}
      {packageName ? (
        <span>
          {t("packageSummary", {
            value: t.has(`packages.${packageName}`)
              ? t(`packages.${packageName}`)
              : (SERVICE_NOW_PACKAGE_LABELS[packageName] ?? packageName),
          })}
        </span>
      ) : null}
    </div>
  );
}

export function ToolConnectionsSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {[0, 1].map((index) => (
        <div key={index} className="flex flex-col gap-3 rounded-xl border p-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ))}
    </div>
  );
}

export function isServiceNowGatewayServer(server: McpServer) {
  const haystack = `${server.name} ${server.url ?? ""} ${server.command ?? ""}`;
  return /service[-_\s]?now/i.test(haystack);
}

export function createFormFromConnector(
  connector: ToolConnector,
): ConnectionFormState {
  const config = initialValues(connector.configSchema, connector.defaultConfig);
  return {
    id: null,
    connectorId: connector.id,
    label: `${connector.name} personal`,
    ownerType: "user",
    config,
    secrets: initialSecretValues(connector.secretSchema),
    isDefault: true,
    status: DEFAULT_STATUS,
    hasExistingSecrets: false,
  };
}

export function createFormFromConnection(
  connector: ToolConnector,
  connection: ToolConnection,
): ConnectionFormState {
  return {
    id: connection.id,
    connectorId: connector.id,
    label: connection.label,
    ownerType: connection.ownerType,
    config: initialValues(connector.configSchema, {
      ...(connector.defaultConfig ?? {}),
      ...(connection.config ?? {}),
    }),
    secrets: initialSecretValues(connector.secretSchema),
    isDefault: connection.isDefault,
    status: connection.status,
    hasExistingSecrets: connection.hasSecrets,
  };
}
