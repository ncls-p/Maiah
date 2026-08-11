import type { ResourceProvenance } from "@/components/resource-provenance-badge";
import type { ResourceAccessSelection } from "@/modules/iam/resource-access-scope";

type McpAuthHintMode = "none" | "bearer" | "api-key" | "env" | "custom";

export interface McpAuthHint {
  mode: McpAuthHintMode;
  apiKeyHeader?: string;
  envKeyName?: string;
  headerKeys?: string[];
  envKeys?: string[];
}

export interface McpServer {
  id: string;
  name: string;
  transport: string;
  url: string | null;
  command: string | null;
  healthStatus: string | null;
  enabled: boolean;
  requireApproval: boolean;
  isGlobal: boolean;
  visibility?: string;
  canEdit: boolean;
  argsJson?: string[] | null;
  hasHeaders: boolean;
  hasEnv: boolean;
  authHint?: McpAuthHint;
  access?: ResourceAccessSelection;
  discovery?: {
    status: "healthy" | "unhealthy" | "manual";
    discovered: number;
  } | null;
  provenance: ResourceProvenance;
}

export interface McpTool {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  requireApproval: boolean;
}

export type SimpleAuthMode = "none" | "bearer" | "api-key" | "env" | "custom";
export type HealthColor = "success" | "warning" | "destructive" | "muted";
export type ServerStatusFilter = "all" | "enabled" | "disabled";
