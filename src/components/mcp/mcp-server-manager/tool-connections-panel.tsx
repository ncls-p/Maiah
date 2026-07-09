"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
	CheckCircle2Icon,
	KeyRoundIcon,
	LockKeyholeIcon,
	PencilIcon,
	PlusIcon,
	RefreshCwIcon,
	ServerIcon,
	Trash2Icon,
	UnplugIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import type { McpServer } from "./types";

type JsonRecord = Record<string, unknown>;
type FieldValue = string | boolean;

type ToolConnectorKind = "mcp" | "builtin" | "custom";
type ToolConnectionOwnerType = "user" | "workspace";
type ToolConnectionStatus = "active" | "invalid" | "expired" | "disabled";

interface SchemaProperty {
	type?: string;
	format?: string;
	title?: string;
	description?: string;
	enum?: string[];
	default?: unknown;
}

interface JsonSchemaObject {
	type?: string;
	required?: string[];
	properties?: Record<string, SchemaProperty>;
}

interface ToolConnector {
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

interface ToolConnection {
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

interface ConnectionFormState {
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

interface ToolConnectionsPanelProps {
	workspaceId: string | null;
	servers: McpServer[];
	canManageWorkspaceConnections: boolean;
}

const DEFAULT_STATUS: ToolConnectionStatus = "active";

const SERVICE_NOW_PACKAGE_LABELS: Record<string, string> = {
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

const SERVICE_NOW_CONFIG_SCHEMA: JsonSchemaObject = {
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

const SERVICE_NOW_SECRET_SCHEMA: JsonSchemaObject = {
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

const SERVICE_NOW_DEFAULT_CONFIG = {
	authType: "basic",
	toolPackage: "full",
};

export function ToolConnectionsPanel({
	workspaceId,
	servers,
	canManageWorkspaceConnections,
}: ToolConnectionsPanelProps) {
	const [connectors, setConnectors] = useState<ToolConnector[]>([]);
	const [connections, setConnections] = useState<ToolConnection[]>([]);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [formOpen, setFormOpen] = useState(false);
	const [activeForm, setActiveForm] = useState<ConnectionFormState | null>(
		null,
	);
	const [provisioningServerId, setProvisioningServerId] = useState("");

	const serverById = useMemo(
		() => new Map(servers.map((server) => [server.id, server])),
		[servers],
	);

	const load = useCallback(async () => {
		if (!workspaceId) return;
		setLoading(true);
		try {
			const [connectorRes, connectionRes] = await Promise.all([
				fetch(`/api/workspace/tool-connectors?workspaceId=${workspaceId}`),
				fetch(`/api/workspace/tool-connections?workspaceId=${workspaceId}`),
			]);
			if (!connectorRes.ok) throw new Error("Failed to load tool connectors");
			if (!connectionRes.ok) throw new Error("Failed to load tool connections");
			setConnectors((await connectorRes.json()) as ToolConnector[]);
			setConnections((await connectionRes.json()) as ToolConnection[]);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to load tool connections",
			);
		} finally {
			setLoading(false);
		}
	}, [workspaceId]);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect -- async tool-connection bootstrap
		void load();
	}, [load]);

	function openCreate(connector: ToolConnector) {
		setActiveForm(createFormFromConnector(connector));
		setFormOpen(true);
	}

	function openEdit(connector: ToolConnector, connection: ToolConnection) {
		setActiveForm(createFormFromConnection(connector, connection));
		setFormOpen(true);
	}

	async function saveConnection() {
		if (!workspaceId || !activeForm) return;
		const connector = connectors.find(
			(item) => item.id === activeForm.connectorId,
		);
		if (!connector) return;

		const validationError = validateForm(connector, activeForm);
		if (validationError) {
			toast.error(validationError);
			return;
		}

		const payload = buildConnectionPayload(workspaceId, connector, activeForm);
		setBusy(true);
		try {
			const res = await fetch(
				activeForm.id
					? `/api/workspace/tool-connections/${activeForm.id}`
					: "/api/workspace/tool-connections",
				{
					method: activeForm.id ? "PATCH" : "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				},
			);
			const data = (await res.json().catch(() => ({}))) as { error?: string };
			if (!res.ok) throw new Error(data.error || "Failed to save connection");
			toast.success(
				activeForm.id ? "Connection updated" : "Connection created",
			);
			setFormOpen(false);
			setActiveForm(null);
			await load();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to save connection",
			);
		} finally {
			setBusy(false);
		}
	}

	async function provisionServiceNowConnector(serverId: string) {
		if (!workspaceId || !serverId) return;
		setBusy(true);
		try {
			const res = await fetch("/api/workspace/tool-connectors", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					workspaceId,
					key: "servicenow",
					name: "ServiceNow",
					description:
						"Per-user ServiceNow connections routed through the MCP gateway.",
					kind: "mcp",
					mcpServerId: serverId,
					configSchema: SERVICE_NOW_CONFIG_SCHEMA,
					secretSchema: SERVICE_NOW_SECRET_SCHEMA,
					defaultConfig: SERVICE_NOW_DEFAULT_CONFIG,
					isGlobal: canManageWorkspaceConnections,
				}),
			});
			const data = (await res.json().catch(() => ({}))) as { error?: string };
			if (!res.ok) throw new Error(data.error || "Failed to create connector");
			toast.success("ServiceNow connector ready");
			await load();
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to create ServiceNow connector",
			);
		} finally {
			setBusy(false);
		}
	}

	async function makeDefault(connection: ToolConnection) {
		if (!workspaceId) return;
		setBusy(true);
		try {
			const res = await fetch(
				`/api/workspace/tool-connections/${connection.id}`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ workspaceId, isDefault: true }),
				},
			);
			if (!res.ok) throw new Error("Failed to update default connection");
			toast.success("Default connection updated");
			await load();
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to update default connection",
			);
		} finally {
			setBusy(false);
		}
	}

	async function removeConnection(connection: ToolConnection) {
		if (!workspaceId) return;
		setBusy(true);
		try {
			const res = await fetch(
				`/api/workspace/tool-connections/${connection.id}?workspaceId=${workspaceId}`,
				{ method: "DELETE" },
			);
			if (!res.ok) throw new Error("Failed to remove connection");
			toast.success("Connection removed");
			await load();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to remove connection",
			);
		} finally {
			setBusy(false);
		}
	}

	const connectorsWithServers = connectors.filter(
		(connector) => connector.enabled || connector.mcpServerId,
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Tool connections</CardTitle>
				<CardDescription>
					Store per-user endpoints and credentials for shared MCP tools. Secrets
					are encrypted and never shown to the model.
				</CardDescription>
				<CardAction>
					<Button
						variant="outline"
						size="sm"
						onClick={() => void load()}
						disabled={loading || busy || !workspaceId}
					>
						<RefreshCwIcon aria-hidden="true" />
						Refresh
					</Button>
				</CardAction>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<Alert>
					<LockKeyholeIcon aria-hidden="true" />
					<AlertTitle>Personal credentials stay private</AlertTitle>
					<AlertDescription>
						Only a short-lived encrypted gateway context is sent during tool
						execution. Existing passwords cannot be read back from this screen.
					</AlertDescription>
				</Alert>

				{loading ? (
					<ToolConnectionsSkeleton />
				) : connectorsWithServers.length === 0 ? (
					<ProvisionServiceNowConnectorCard
						servers={servers}
						busy={busy}
						selectedServerId={provisioningServerId || servers[0]?.id || ""}
						onServerChangeAction={setProvisioningServerId}
						onProvisionAction={(serverId) =>
							void provisionServiceNowConnector(serverId)
						}
					/>
				) : (
					<div className="grid gap-3 md:grid-cols-2">
						{connectorsWithServers.map((connector) => {
							const connectorConnections = connections.filter(
								(connection) => connection.connectorId === connector.id,
							);
							return (
								<ConnectorCard
									key={connector.id}
									connector={connector}
									connections={connectorConnections}
									server={
										connector.mcpServerId
											? serverById.get(connector.mcpServerId)
											: undefined
									}
									busy={busy}
									canManageWorkspaceConnections={canManageWorkspaceConnections}
									onCreateAction={openCreate}
									onEditAction={openEdit}
									onMakeDefaultAction={(connection) =>
										void makeDefault(connection)
									}
									onRemoveAction={(connection) =>
										void removeConnection(connection)
									}
								/>
							);
						})}
					</div>
				)}
			</CardContent>

			<ConnectionDialog
				open={formOpen}
				busy={busy}
				form={activeForm}
				connector={
					activeForm
						? (connectors.find((item) => item.id === activeForm.connectorId) ??
							null)
						: null
				}
				canManageWorkspaceConnections={canManageWorkspaceConnections}
				onOpenChangeAction={(open) => {
					setFormOpen(open);
					if (!open) setActiveForm(null);
				}}
				onFormChangeAction={setActiveForm}
				onSaveAction={() => void saveConnection()}
			/>
		</Card>
	);
}

function ProvisionServiceNowConnectorCard({
	servers,
	busy,
	selectedServerId,
	onServerChangeAction,
	onProvisionAction,
}: {
	servers: McpServer[];
	busy: boolean;
	selectedServerId: string;
	onServerChangeAction: (serverId: string) => void;
	onProvisionAction: (serverId: string) => void;
}) {
	if (servers.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center">
				<UnplugIcon
					className="size-5 text-muted-foreground"
					aria-hidden="true"
				/>
				<p className="font-medium">No configurable tool connectors yet</p>
				<p className="max-w-md text-sm text-muted-foreground">
					Add and sync the ServiceNow MCP server first, then provision its
					connector here.
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4 rounded-xl border border-dashed p-5">
			<div className="flex items-start gap-3">
				<div className="rounded-lg border bg-muted/40 p-2">
					<ServerIcon
						className="size-5 text-muted-foreground"
						aria-hidden="true"
					/>
				</div>
				<div className="min-w-0">
					<p className="font-medium">Provision the ServiceNow connector</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Choose the MCP gateway server that exposes ServiceNow tools. This
						creates the connector needed by per-user credentials.
					</p>
				</div>
			</div>
			<div className="flex flex-col gap-3 sm:flex-row">
				<Select value={selectedServerId} onValueChange={onServerChangeAction}>
					<SelectTrigger className="w-full" aria-label="ServiceNow MCP server">
						<SelectValue placeholder="Select MCP server" />
					</SelectTrigger>
					<SelectContent>
						{servers.map((server) => (
							<SelectItem key={server.id} value={server.id}>
								{server.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button
					className="sm:w-fit"
					onClick={() => onProvisionAction(selectedServerId)}
					disabled={busy || !selectedServerId}
				>
					<PlusIcon aria-hidden="true" />
					Provision connector
				</Button>
			</div>
		</div>
	);
}

function ConnectorCard({
	connector,
	connections,
	server,
	busy,
	canManageWorkspaceConnections,
	onCreateAction,
	onEditAction,
	onMakeDefaultAction,
	onRemoveAction,
}: {
	connector: ToolConnector;
	connections: ToolConnection[];
	server?: McpServer;
	busy: boolean;
	canManageWorkspaceConnections: boolean;
	onCreateAction: (connector: ToolConnector) => void;
	onEditAction: (connector: ToolConnector, connection: ToolConnection) => void;
	onMakeDefaultAction: (connection: ToolConnection) => void;
	onRemoveAction: (connection: ToolConnection) => void;
}) {
	return (
		<div className="flex min-h-72 flex-col gap-4 rounded-xl border bg-background/60 p-4">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<h3 className="truncate font-medium">{connector.name}</h3>
						<Badge variant={connector.enabled ? "secondary" : "outline"}>
							{connector.enabled ? "Enabled" : "Disabled"}
						</Badge>
						{connector.isGlobal ? (
							<Badge variant="outline">Global</Badge>
						) : null}
					</div>
					<p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
						{connector.description ||
							"Personalized settings for this connector."}
					</p>
					{server ? (
						<p className="mt-2 text-xs text-muted-foreground">
							MCP server: <span className="font-medium">{server.name}</span>
						</p>
					) : null}
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() => onCreateAction(connector)}
					disabled={!connector.enabled || busy}
				>
					<PlusIcon aria-hidden="true" />
					Add
				</Button>
			</div>

			{connections.length === 0 ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-5 text-center">
					<KeyRoundIcon
						className="size-5 text-muted-foreground"
						aria-hidden="true"
					/>
					<p className="text-sm font-medium">No connection configured</p>
					<p className="text-xs text-muted-foreground">
						Add your endpoint and credentials before agents can call this tool.
					</p>
				</div>
			) : (
				<div className="flex flex-col gap-2">
					{connections.map((connection) => {
						const editable =
							canManageWorkspaceConnections || connection.ownerType === "user";
						return (
							<div key={connection.id} className="rounded-lg border p-3">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<div className="flex flex-wrap items-center gap-2">
											<p className="truncate text-sm font-medium">
												{connection.label}
											</p>
											{connection.isDefault ? (
												<Badge variant="secondary">
													<CheckCircle2Icon aria-hidden="true" />
													Default
												</Badge>
											) : null}
											<Badge variant="outline">{connection.ownerType}</Badge>
											<StatusBadge status={connection.status} />
											{connection.hasSecrets ? (
												<Badge variant="outline">Secrets saved</Badge>
											) : null}
										</div>
										<ConnectionConfigSummary config={connection.config} />
									</div>
								</div>
								<div className="mt-3 flex flex-wrap gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={() => onEditAction(connector, connection)}
										disabled={!editable || busy}
									>
										<PencilIcon aria-hidden="true" />
										Edit
									</Button>
									{connection.isDefault ? null : (
										<Button
											variant="outline"
											size="sm"
											onClick={() => onMakeDefaultAction(connection)}
											disabled={!editable || busy}
										>
											Make default
										</Button>
									)}
									<Button
										variant="ghost"
										size="sm"
										onClick={() => onRemoveAction(connection)}
										disabled={!editable || busy}
									>
										<Trash2Icon aria-hidden="true" />
										Remove
									</Button>
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

function ConnectionDialog({
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
						{editing ? "Edit" : "Add"} {connector?.name ?? "tool"} connection
					</DialogTitle>
					<DialogDescription>
						Configure the endpoint and credentials used only for your tool
						calls. Secrets are write-only in this form.
					</DialogDescription>
				</DialogHeader>

				{form && connector ? (
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="tool-connection-label">Label</FieldLabel>
							<Input
								id="tool-connection-label"
								value={form.label}
								onChange={(event) => updateForm({ label: event.target.value })}
								placeholder={`${connector.name} personal connection`}
							/>
							<FieldDescription>
								A friendly name shown in the tool connection list.
							</FieldDescription>
						</Field>

						{canManageWorkspaceConnections ? (
							<Field>
								<FieldLabel>Scope</FieldLabel>
								<Select
									value={form.ownerType}
									onValueChange={(value) =>
										updateForm({ ownerType: value as ToolConnectionOwnerType })
									}
									disabled={editing}
								>
									<SelectTrigger
										className="w-full"
										aria-label="Connection scope"
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="user">Personal connection</SelectItem>
										<SelectItem value="workspace">Workspace default</SelectItem>
									</SelectContent>
								</Select>
								<FieldDescription>
									Personal credentials are used for this account only. Workspace
									connections can be reused by members.
								</FieldDescription>
							</Field>
						) : null}

						{configFields.length > 0 ? (
							<div className="flex flex-col gap-4 rounded-xl border p-4">
								<div>
									<p className="font-medium">Configuration</p>
									<p className="text-sm text-muted-foreground">
										Endpoint and non-secret options sent encrypted to the
										gateway.
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
									<p className="font-medium">Secrets</p>
									<p className="text-sm text-muted-foreground">
										{editing && form.hasExistingSecrets
											? "Leave these blank to keep the encrypted secrets already saved. Fill every required secret to rotate them."
											: "Secrets are encrypted before storage and are not displayed again."}
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
												? "Saved — leave blank to keep"
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
									Use as default
								</FieldLabel>
								<FieldDescription>
									Agents will use this connection unless a tool-specific setting
									chooses another one.
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
								<FieldLabel>Status</FieldLabel>
								<Select
									value={form.status}
									onValueChange={(value) =>
										updateForm({ status: value as ToolConnectionStatus })
									}
								>
									<SelectTrigger
										className="w-full"
										aria-label="Connection status"
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="active">Active</SelectItem>
										<SelectItem value="disabled">Disabled</SelectItem>
										<SelectItem value="invalid">Invalid</SelectItem>
										<SelectItem value="expired">Expired</SelectItem>
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
						Cancel
					</Button>
					<Button onClick={onSaveAction} disabled={busy || !form || !connector}>
						{busy ? "Saving..." : "Save connection"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function SchemaFieldControl({
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
	const label = property.title || humanizeKey(fieldKey);
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
							<SelectValue placeholder={`Select ${label.toLowerCase()}`} />
						</SelectTrigger>
						<SelectContent>
							{property.enum.map((option) => (
								<SelectItem key={option} value={option}>
									{SERVICE_NOW_PACKAGE_LABELS[option] ?? humanizeKey(option)}
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

function StatusBadge({ status }: { status: ToolConnectionStatus }) {
	return (
		<Badge
			variant={status === "active" ? "secondary" : "outline"}
			className={cn(status !== "active" && "text-muted-foreground")}
		>
			{humanizeKey(status)}
		</Badge>
	);
}

function ConnectionConfigSummary({ config }: { config: JsonRecord | null }) {
	const instanceUrl =
		typeof config?.instanceUrl === "string" ? config.instanceUrl : null;
	const packageName =
		typeof config?.toolPackage === "string" ? config.toolPackage : null;
	const authType =
		typeof config?.authType === "string" ? config.authType : null;

	return (
		<div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
			{instanceUrl ? <span className="truncate">{instanceUrl}</span> : null}
			{authType ? <span>Auth: {humanizeKey(authType)}</span> : null}
			{packageName ? (
				<span>
					Package: {SERVICE_NOW_PACKAGE_LABELS[packageName] ?? packageName}
				</span>
			) : null}
		</div>
	);
}

function ToolConnectionsSkeleton() {
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

function createFormFromConnector(
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

function createFormFromConnection(
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

function initialValues(
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

function initialSecretValues(
	schema: JsonSchemaObject | null,
): Record<string, string> {
	return Object.fromEntries(schemaFields(schema).map(({ key }) => [key, ""]));
}

function schemaFields(schema: JsonSchemaObject | null) {
	const properties = schema?.properties ?? {};
	const requiredFields = new Set(schema?.required ?? []);
	return Object.entries(properties).map(([key, property]) => ({
		key,
		property,
		required: requiredFields.has(key),
	}));
}

function validateForm(connector: ToolConnector, form: ConnectionFormState) {
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

function buildConnectionPayload(
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

function humanizeKey(value: string) {
	return value
		.replace(/[_-]+/g, " ")
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function placeholderFor(key: string, property: SchemaProperty) {
	if (property.format === "uri") return "https://example.service-now.com";
	if (key.toLowerCase().includes("username")) return "service.account";
	return property.title ? `Enter ${property.title.toLowerCase()}` : undefined;
}
