export interface McpServer {
	id: string;
	name: string;
	transport: string;
	url: string | null;
	command: string | null;
	healthStatus: string | null;
	enabled: boolean;
	requireApproval: boolean;
	argsJson?: string[] | null;
	hasHeaders: boolean;
	hasEnv: boolean;
}

export interface McpTool {
	id: string;
	name: string;
	description: string | null;
	enabled: boolean;
	requireApproval: boolean;
}

export type SimpleAuthMode = "none" | "bearer" | "api-key" | "env";
export type HealthColor = "success" | "warning" | "destructive" | "muted";
export type ServerStatusFilter = "all" | "enabled" | "disabled";
