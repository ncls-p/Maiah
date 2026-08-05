"use client";



import { ConnectionFormState,FieldValue,JsonRecord,JsonSchemaObject,SchemaProperty,ToolConnector } from "./tool-connections-panel.json-record";


export function initialValues(
  schema: JsonSchemaObject | null,
  existing: JsonRecord | null,
): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {};
  for (const { key, property } of schemaFields(schema)) {
    const candidate = existing?.[key] ?? property.default;
    if (property.type === "boolean") {
      values[key] = Boolean(candidate);
    } else if (typeof candidate === "string") {
      values[key] = candidate;
    } else if (typeof candidate === "number") {
      values[key] = String(candidate);
    } else if (typeof candidate === "boolean") {
      values[key] = candidate;
    } else if (property.enum?.[0]) {
      values[key] = property.enum[0];
    } else {
      values[key] = "";
    }
  }
  return values;
}

export function initialSecretValues(
  schema: JsonSchemaObject | null,
): Record<string, string> {
  return Object.fromEntries(schemaFields(schema).map(({ key }) => [key, ""]));
}

export function schemaFields(schema: JsonSchemaObject | null) {
  const properties = schema?.properties ?? {};
  const requiredFields = new Set(schema?.required ?? []);
  return Object.entries(properties).map(([key, property]) => ({
    key,
    property,
    required: requiredFields.has(key),
  }));
}

export function validateForm(connector: ToolConnector, form: ConnectionFormState) {
  if (!form.label.trim()) return "Add a connection label";
  for (const { key, required, property } of schemaFields(
    connector.configSchema,
  )) {
    if (!required) continue;
    const value = form.config[key];
    if (property.type === "boolean") continue;
    if (typeof value !== "string" || !value.trim()) {
      return `${humanizeKey(key)} is required`;
    }
  }

  const secretValues = Object.fromEntries(
    Object.entries(form.secrets).filter(([, value]) => value.trim()),
  );
  const isRotatingSecrets = Object.keys(secretValues).length > 0;
  const mustProvideSecrets =
    !form.id || !form.hasExistingSecrets || isRotatingSecrets;
  if (!mustProvideSecrets) return null;

  for (const { key, required } of schemaFields(connector.secretSchema)) {
    if (!required) continue;
    if (!form.secrets[key]?.trim()) return `${humanizeKey(key)} is required`;
  }
  return null;
}

export function buildConnectionPayload(
  workspaceId: string,
  connector: ToolConnector,
  form: ConnectionFormState,
) {
  const config = serializeConfig(connector.configSchema, form.config);
  const secretValues = Object.fromEntries(
    Object.entries(form.secrets)
      .map(([key, value]) => [key, value.trim()] as const)
      .filter(([, value]) => value),
  );
  return {
    workspaceId,
    connectorId: form.connectorId,
    ownerType: form.ownerType,
    label: form.label.trim(),
    config,
    secrets: Object.keys(secretValues).length > 0 ? secretValues : undefined,
    isDefault: form.isDefault,
    status: form.id ? form.status : undefined,
  };
}

function serializeConfig(
  schema: JsonSchemaObject | null,
  values: Record<string, FieldValue>,
) {
  const config: JsonRecord = {};
  for (const { key, property } of schemaFields(schema)) {
    const value = values[key];
    if (property.type === "boolean") {
      config[key] = Boolean(value);
    } else if (typeof value === "string" && value.trim()) {
      config[key] = value.trim();
    }
  }
  return config;
}

export function humanizeKey(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function placeholderFor(key: string, property: SchemaProperty) {
  if (property.format === "uri") return "https://example.service-now.com";
  if (key.toLowerCase().includes("username")) return "service.account";
  return property.title ? `Enter ${property.title.toLowerCase()}` : undefined;
}
