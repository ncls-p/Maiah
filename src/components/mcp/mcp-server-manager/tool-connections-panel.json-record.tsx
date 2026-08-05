"use client";



import type { McpServer,McpTool } from "./types";

export type JsonRecord = Record<string, unknown>;
export type FieldValue = string | boolean;

type ToolConnectorKind = "mcp" | "builtin" | "custom";
export type ToolConnectionOwnerType = "user" | "workspace";
export type ToolConnectionStatus = "active" | "invalid" | "expired" | "disabled";

export interface SchemaProperty {
  type?: string;
  format?: string;
  title?: string;
  description?: string;
  enum?: string[];
  default?: unknown;
}

export interface JsonSchemaObject {
  type?: string;
  required?: string[];
  properties?: Record<string, SchemaProperty>;
}

export interface ToolConnector {
  id: string;
  workspaceId: string;
  key: string;
  name: string;
  description: string | null;
  kind: ToolConnectorKind;
  mcpServerId: string | null;
  configSchema: JsonSchemaObject | null;
  secretSchema: JsonSchemaObject | null;
  defaultConfig: JsonRecord | null;
  enabled: boolean;
  isGlobal: boolean;
}

export interface ToolConnection {
  id: string;
  workspaceId: string;
  connectorId: string;
  ownerType: ToolConnectionOwnerType;
  ownerUserId: string | null;
  label: string;
  config: JsonRecord | null;
  hasSecrets: boolean;
  isDefault: boolean;
  status: ToolConnectionStatus;
  createdAt: string;
  updatedAt: string;
  lastValidatedAt: string | null;
}

export interface ConnectionFormState {
  id: string | null;
  connectorId: string;
  label: string;
  ownerType: ToolConnectionOwnerType;
  config: Record<string, FieldValue>;
  secrets: Record<string, string>;
  isDefault: boolean;
  status: ToolConnectionStatus;
  hasExistingSecrets: boolean;
}

export interface ToolConnectionsPanelProps {
  workspaceId: string | null;
  servers: McpServer[];
  toolsByServer: Record<string, McpTool[]>;
  canManageMcpServers: boolean;
  canManageWorkspaceConnections: boolean;
  embedded?: boolean;
}

export const DEFAULT_STATUS: ToolConnectionStatus = "active";

export const SERVICE_NOW_PACKAGE_LABELS: Record<string, string> = {
  full: "Full package",
  service_desk: "Service desk",
  catalog_builder: "Catalog builder",
  change_coordinator: "Change coordinator",
  knowledge_author: "Knowledge author",
  platform_developer: "Platform developer",
  agile_management: "Agile management",
  system_administrator: "System administrator",
  none: "No tools",
};

export const SERVICE_NOW_CONFIG_SCHEMA: JsonSchemaObject = {
  type: "object",
  required: ["instanceUrl", "authType"],
  properties: {
    instanceUrl: {
      type: "string",
      format: "uri",
      title: "ServiceNow instance URL",
      description: "Example: https://your-instance.service-now.com",
    },
    authType: {
      type: "string",
      enum: ["basic", "oauth", "api_key"],
      default: "basic",
    },
    toolPackage: {
      type: "string",
      enum: Object.keys(SERVICE_NOW_PACKAGE_LABELS),
      default: "full",
    },
  },
};

export const SERVICE_NOW_SECRET_SCHEMA: JsonSchemaObject = {
  type: "object",
  required: ["username", "password"],
  properties: {
    username: { type: "string", title: "ServiceNow username" },
    password: { type: "password", title: "ServiceNow password" },
    apiKey: { type: "password", title: "ServiceNow API key" },
    clientId: { type: "string", title: "OAuth client ID" },
    clientSecret: { type: "password", title: "OAuth client secret" },
  },
};

export const SERVICE_NOW_DEFAULT_CONFIG = {
  authType: "basic",
  toolPackage: "full",
};
