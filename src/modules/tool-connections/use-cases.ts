import {
	createCipheriv,
	createHash,
	createHmac,
	randomBytes,
} from "node:crypto";

import { decryptValue, encryptValue } from "@/lib/crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
	toolConnectionRequirements,
	toolConnections,
	toolConnectors,
	userToolSettings,
} from "@/server/infrastructure/db/schema";
import { and, desc, eq, isNull, or } from "drizzle-orm";

const MCP_TOOL_SOURCE = "mcp";
const CONTEXT_HEADER = "x-maiah-tool-context";
const SIGNATURE_HEADER = "x-maiah-tool-context-signature";
const CONTEXT_TTL_MS = 5 * 60 * 1000;

type ToolConnector = typeof toolConnectors.$inferSelect;
type ToolConnection = typeof toolConnections.$inferSelect;
type UserToolSetting = typeof userToolSettings.$inferSelect;

type ToolConnectorKind = "mcp" | "builtin" | "custom";
type ToolConnectionOwnerType = "user" | "workspace";

type JsonRecord = Record<string, unknown>;
type SecretRecord = Record<string, string>;

export interface CreateToolConnectorInput {
	workspaceId: string;
	userId: string;
	key: string;
	name: string;
	description?: string | null;
	kind: ToolConnectorKind;
	mcpServerId?: string | null;
	configSchema?: JsonRecord | null;
	secretSchema?: JsonRecord | null;
	defaultConfig?: JsonRecord | null;
	isGlobal?: boolean;
}

export interface CreateToolConnectionInput {
	workspaceId: string;
	userId: string;
	connectorId: string;
	ownerType?: ToolConnectionOwnerType;
	label: string;
	config?: JsonRecord;
	secrets?: SecretRecord;
	isDefault?: boolean;
	canManageWorkspaceConnections?: boolean;
}

export interface UpdateToolConnectionInput {
	connectionId: string;
	workspaceId: string;
	userId: string;
	label?: string;
	config?: JsonRecord | null;
	secrets?: SecretRecord | null;
	isDefault?: boolean;
	status?: "active" | "invalid" | "expired" | "disabled";
	canManageWorkspaceConnections?: boolean;
}

export interface UpsertUserToolSettingsInput {
	workspaceId: string;
	userId: string;
	toolSource: string;
	toolId: string;
	connectionId?: string | null;
	config?: JsonRecord | null;
	secrets?: SecretRecord | null;
	enabled?: boolean;
}

export interface UpsertToolConnectionRequirementInput {
	workspaceId: string;
	connectorId: string;
	toolSource: string;
	toolId: string;
	required?: boolean;
	configSchema?: JsonRecord | null;
}

export interface ResolveToolExecutionHeadersInput {
	workspaceId: string;
	userId: string;
	toolSource: string;
	toolId: string;
	mcpServerId?: string;
}

function normalizeConnectorKey(key: string) {
	return key
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-");
}

function jsonRecord(value: unknown): JsonRecord {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as JsonRecord)
		: {};
}

function isSecretRecord(value: unknown): value is SecretRecord {
	return (
		value !== null &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		Object.values(value).every((item) => typeof item === "string")
	);
}

async function encryptRecord(record?: SecretRecord | null) {
	if (!record) return null;
	const encrypted: SecretRecord = {};
	for (const [key, value] of Object.entries(record)) {
		if (!value) continue;
		encrypted[key] = await encryptValue(value);
	}
	return encrypted;
}

async function decryptRecord(encrypted?: unknown) {
	if (!isSecretRecord(encrypted)) return {};
	const decrypted: SecretRecord = {};
	for (const [key, value] of Object.entries(encrypted)) {
		decrypted[key] = await decryptValue(value);
	}
	return decrypted;
}

function visibleConnectorCondition(
	workspaceId: string,
	userId: string,
	canManageGlobal = false,
) {
	return and(
		eq(toolConnectors.workspaceId, workspaceId),
		isNull(toolConnectors.archivedAt),
		canManageGlobal
			? undefined
			: or(
					eq(toolConnectors.createdById, userId),
					eq(toolConnectors.isGlobal, true),
				),
	);
}

function canManageConnection(
	connection: ToolConnection,
	userId: string,
	canManageWorkspaceConnections = false,
) {
	if (connection.ownerType === "user") return connection.ownerUserId === userId;
	return canManageWorkspaceConnections;
}

async function clearDefaultConnections(
	client: Pick<typeof db, "update">,
	connection: Pick<
		ToolConnection,
		"workspaceId" | "connectorId" | "ownerType" | "ownerUserId"
	>,
) {
	await client
		.update(toolConnections)
		.set({ isDefault: false, updatedAt: new Date() })
		.where(
			and(
				eq(toolConnections.workspaceId, connection.workspaceId),
				eq(toolConnections.connectorId, connection.connectorId),
				connection.ownerType === "workspace"
					? and(
							eq(toolConnections.ownerType, "workspace"),
							isNull(toolConnections.ownerUserId),
						)
					: and(
							eq(toolConnections.ownerType, "user"),
							eq(toolConnections.ownerUserId, connection.ownerUserId ?? ""),
						),
			),
		);
}

export function toSafeToolConnector(connector: ToolConnector) {
	return {
		id: connector.id,
		workspaceId: connector.workspaceId,
		key: connector.key,
		name: connector.name,
		description: connector.description,
		kind: connector.kind,
		mcpServerId: connector.mcpServerId,
		configSchema: connector.configSchemaJson,
		secretSchema: connector.secretSchemaJson,
		defaultConfig: connector.defaultConfigJson,
		enabled: connector.enabled,
		isGlobal: connector.isGlobal,
		createdById: connector.createdById,
		createdAt: connector.createdAt,
		updatedAt: connector.updatedAt,
	};
}

export function toSafeToolConnection(connection: ToolConnection) {
	return {
		id: connection.id,
		workspaceId: connection.workspaceId,
		connectorId: connection.connectorId,
		ownerType: connection.ownerType,
		ownerUserId: connection.ownerUserId,
		label: connection.label,
		config: connection.configJson,
		hasSecrets:
			Boolean(connection.encryptedSecretsJson) &&
			Object.keys(jsonRecord(connection.encryptedSecretsJson)).length > 0,
		isDefault: connection.isDefault,
		status: connection.status,
		lastValidatedAt: connection.lastValidatedAt,
		createdAt: connection.createdAt,
		updatedAt: connection.updatedAt,
	};
}

export async function createToolConnector(input: CreateToolConnectorInput) {
	const key = normalizeConnectorKey(input.key);
	if (!key) throw new Error("Tool connector key is required");

	const [connector] = await db
		.insert(toolConnectors)
		.values({
			workspaceId: input.workspaceId,
			createdById: input.userId,
			key,
			name: input.name,
			description: input.description || null,
			kind: input.kind,
			mcpServerId: input.mcpServerId || null,
			configSchemaJson: input.configSchema ?? null,
			secretSchemaJson: input.secretSchema ?? null,
			defaultConfigJson: input.defaultConfig ?? null,
			isGlobal: input.isGlobal ?? false,
		})
		.returning();

	await audit.emit({
		workspaceId: input.workspaceId,
		actorPrincipalType: "user",
		actorPrincipalId: input.userId,
		action: "toolConnector.created",
		resourceType: "mcp_server",
		resourceId: connector.mcpServerId ?? connector.id,
		outcome: "success",
		metadata: {
			connectorId: connector.id,
			key: connector.key,
			kind: connector.kind,
		},
	});

	logger.info("Tool connector created", {
		connectorId: connector.id,
		workspaceId: input.workspaceId,
		userId: input.userId,
	});
	return connector;
}

export async function listToolConnectors(
	workspaceId: string,
	userId: string,
	canManageGlobal = false,
) {
	const connectors = await db
		.select()
		.from(toolConnectors)
		.where(visibleConnectorCondition(workspaceId, userId, canManageGlobal))
		.orderBy(toolConnectors.name);
	return connectors.map(toSafeToolConnector);
}

export async function getToolConnector(
	connectorId: string,
	workspaceId: string,
	userId: string,
	canManageGlobal = false,
) {
	const [connector] = await db
		.select()
		.from(toolConnectors)
		.where(
			and(
				eq(toolConnectors.id, connectorId),
				visibleConnectorCondition(workspaceId, userId, canManageGlobal),
			),
		)
		.limit(1);
	return connector ?? null;
}

export async function createToolConnection(input: CreateToolConnectionInput) {
	const ownerType = input.ownerType ?? "user";
	if (ownerType === "workspace" && !input.canManageWorkspaceConnections) {
		throw new Error("Only admins can create workspace tool connections");
	}

	const connector = await getToolConnector(
		input.connectorId,
		input.workspaceId,
		input.userId,
		input.canManageWorkspaceConnections,
	);
	if (!connector || !connector.enabled)
		throw new Error("Tool connector not found");

	const connectionSeed = {
		workspaceId: input.workspaceId,
		connectorId: input.connectorId,
		ownerType,
		ownerUserId: ownerType === "user" ? input.userId : null,
	};

	const [connection] = await db.transaction(async (tx) => {
		if (input.isDefault) await clearDefaultConnections(tx, connectionSeed);
		return tx
			.insert(toolConnections)
			.values({
				...connectionSeed,
				label: input.label,
				configJson: input.config ?? null,
				encryptedSecretsJson: await encryptRecord(input.secrets),
				isDefault: input.isDefault ?? false,
				status: "active",
			})
			.returning();
	});

	await audit.emit({
		workspaceId: input.workspaceId,
		actorPrincipalType: "user",
		actorPrincipalId: input.userId,
		action: "toolConnection.created",
		resourceType: "mcp_server",
		resourceId: connector.mcpServerId ?? connector.id,
		outcome: "success",
		metadata: {
			connectorId: connector.id,
			connectionId: connection.id,
			ownerType,
		},
	});

	return connection;
}

export async function listToolConnections(
	workspaceId: string,
	userId: string,
	canManageWorkspaceConnections = false,
) {
	const connections = await db
		.select()
		.from(toolConnections)
		.where(
			and(
				eq(toolConnections.workspaceId, workspaceId),
				isNull(toolConnections.archivedAt),
				canManageWorkspaceConnections
					? undefined
					: or(
							eq(toolConnections.ownerUserId, userId),
							eq(toolConnections.ownerType, "workspace"),
						),
			),
		)
		.orderBy(desc(toolConnections.isDefault), desc(toolConnections.createdAt));
	return connections.map(toSafeToolConnection);
}

export async function updateToolConnection(input: UpdateToolConnectionInput) {
	const [existing] = await db
		.select()
		.from(toolConnections)
		.where(
			and(
				eq(toolConnections.id, input.connectionId),
				eq(toolConnections.workspaceId, input.workspaceId),
				isNull(toolConnections.archivedAt),
			),
		)
		.limit(1);
	if (!existing) throw new Error("Tool connection not found");
	if (
		!canManageConnection(
			existing,
			input.userId,
			input.canManageWorkspaceConnections,
		)
	) {
		throw new Error("Not allowed to manage this tool connection");
	}

	const updates = {
		label: input.label,
		configJson: input.config === undefined ? undefined : input.config,
		encryptedSecretsJson:
			input.secrets === undefined
				? undefined
				: await encryptRecord(input.secrets),
		isDefault: input.isDefault,
		status: input.status,
		updatedAt: new Date(),
	};

	const [connection] = await db.transaction(async (tx) => {
		if (input.isDefault) await clearDefaultConnections(tx, existing);
		return tx
			.update(toolConnections)
			.set(updates)
			.where(eq(toolConnections.id, input.connectionId))
			.returning();
	});

	return connection;
}

export async function archiveToolConnection(
	connectionId: string,
	workspaceId: string,
	userId: string,
	canManageWorkspaceConnections = false,
) {
	const [existing] = await db
		.select()
		.from(toolConnections)
		.where(
			and(
				eq(toolConnections.id, connectionId),
				eq(toolConnections.workspaceId, workspaceId),
				isNull(toolConnections.archivedAt),
			),
		)
		.limit(1);
	if (!existing) throw new Error("Tool connection not found");
	if (!canManageConnection(existing, userId, canManageWorkspaceConnections)) {
		throw new Error("Not allowed to manage this tool connection");
	}

	await db
		.update(toolConnections)
		.set({ archivedAt: new Date(), updatedAt: new Date(), isDefault: false })
		.where(eq(toolConnections.id, connectionId));
	return { success: true };
}

export async function upsertToolConnectionRequirement(
	input: UpsertToolConnectionRequirementInput,
) {
	const [existing] = await db
		.select()
		.from(toolConnectionRequirements)
		.where(
			and(
				eq(toolConnectionRequirements.workspaceId, input.workspaceId),
				eq(toolConnectionRequirements.connectorId, input.connectorId),
				eq(toolConnectionRequirements.toolSource, input.toolSource),
				eq(toolConnectionRequirements.toolId, input.toolId),
			),
		)
		.limit(1);

	if (existing) {
		const [requirement] = await db
			.update(toolConnectionRequirements)
			.set({
				required: input.required ?? existing.required,
				configSchemaJson: input.configSchema ?? existing.configSchemaJson,
				updatedAt: new Date(),
			})
			.where(eq(toolConnectionRequirements.id, existing.id))
			.returning();
		return requirement;
	}

	const [requirement] = await db
		.insert(toolConnectionRequirements)
		.values({
			workspaceId: input.workspaceId,
			connectorId: input.connectorId,
			toolSource: input.toolSource,
			toolId: input.toolId,
			required: input.required ?? true,
			configSchemaJson: input.configSchema ?? null,
		})
		.returning();
	return requirement;
}

export async function upsertUserToolSettings(
	input: UpsertUserToolSettingsInput,
) {
	const [existing] = await db
		.select()
		.from(userToolSettings)
		.where(
			and(
				eq(userToolSettings.workspaceId, input.workspaceId),
				eq(userToolSettings.userId, input.userId),
				eq(userToolSettings.toolSource, input.toolSource),
				eq(userToolSettings.toolId, input.toolId),
			),
		)
		.limit(1);

	const values = {
		workspaceId: input.workspaceId,
		userId: input.userId,
		toolSource: input.toolSource,
		toolId: input.toolId,
		connectionId: input.connectionId,
		configJson: input.config,
		encryptedSecretsJson:
			input.secrets === undefined
				? undefined
				: await encryptRecord(input.secrets),
		enabled: input.enabled,
		updatedAt: new Date(),
	};

	if (existing) {
		const [settings] = await db
			.update(userToolSettings)
			.set(values)
			.where(eq(userToolSettings.id, existing.id))
			.returning();
		return settings;
	}

	const [settings] = await db
		.insert(userToolSettings)
		.values({
			workspaceId: input.workspaceId,
			userId: input.userId,
			toolSource: input.toolSource,
			toolId: input.toolId,
			connectionId: input.connectionId ?? null,
			configJson: input.config ?? null,
			encryptedSecretsJson: await encryptRecord(input.secrets),
			enabled: input.enabled ?? true,
		})
		.returning();
	return settings;
}

async function findConnectorForTool(input: ResolveToolExecutionHeadersInput) {
	const [requirement] = await db
		.select()
		.from(toolConnectionRequirements)
		.where(
			and(
				eq(toolConnectionRequirements.workspaceId, input.workspaceId),
				eq(toolConnectionRequirements.toolSource, input.toolSource),
				eq(toolConnectionRequirements.toolId, input.toolId),
			),
		)
		.limit(1);

	if (requirement) {
		const [connector] = await db
			.select()
			.from(toolConnectors)
			.where(
				and(
					eq(toolConnectors.id, requirement.connectorId),
					eq(toolConnectors.workspaceId, input.workspaceId),
					eq(toolConnectors.enabled, true),
					isNull(toolConnectors.archivedAt),
				),
			)
			.limit(1);
		return { connector: connector ?? null, required: requirement.required };
	}

	if (input.toolSource !== MCP_TOOL_SOURCE || !input.mcpServerId) {
		return { connector: null, required: false };
	}

	const [connector] = await db
		.select()
		.from(toolConnectors)
		.where(
			and(
				eq(toolConnectors.workspaceId, input.workspaceId),
				eq(toolConnectors.mcpServerId, input.mcpServerId),
				eq(toolConnectors.enabled, true),
				isNull(toolConnectors.archivedAt),
			),
		)
		.limit(1);

	return { connector: connector ?? null, required: Boolean(connector) };
}

async function findUserToolSettings(input: ResolveToolExecutionHeadersInput) {
	const [settings] = await db
		.select()
		.from(userToolSettings)
		.where(
			and(
				eq(userToolSettings.workspaceId, input.workspaceId),
				eq(userToolSettings.userId, input.userId),
				eq(userToolSettings.toolSource, input.toolSource),
				eq(userToolSettings.toolId, input.toolId),
			),
		)
		.limit(1);
	return settings ?? null;
}

async function findVisibleConnection(
	connectionId: string,
	workspaceId: string,
	userId: string,
) {
	const [connection] = await db
		.select()
		.from(toolConnections)
		.where(
			and(
				eq(toolConnections.id, connectionId),
				eq(toolConnections.workspaceId, workspaceId),
				eq(toolConnections.status, "active"),
				isNull(toolConnections.archivedAt),
				or(
					eq(toolConnections.ownerUserId, userId),
					eq(toolConnections.ownerType, "workspace"),
				),
			),
		)
		.limit(1);
	return connection ?? null;
}

async function findPreferredConnection(
	connectorId: string,
	input: ResolveToolExecutionHeadersInput,
	settings: UserToolSetting | null,
) {
	if (settings?.connectionId) {
		const connection = await findVisibleConnection(
			settings.connectionId,
			input.workspaceId,
			input.userId,
		);
		if (connection) return connection;
	}

	const connections = await db
		.select()
		.from(toolConnections)
		.where(
			and(
				eq(toolConnections.workspaceId, input.workspaceId),
				eq(toolConnections.connectorId, connectorId),
				eq(toolConnections.status, "active"),
				isNull(toolConnections.archivedAt),
				or(
					eq(toolConnections.ownerUserId, input.userId),
					eq(toolConnections.ownerType, "workspace"),
				),
			),
		)
		.orderBy(desc(toolConnections.isDefault), desc(toolConnections.createdAt));

	return (
		connections.find(
			(connection) =>
				connection.ownerUserId === input.userId && connection.isDefault,
		) ??
		connections.find(
			(connection) =>
				connection.ownerType === "workspace" && connection.isDefault,
		) ??
		connections.find((connection) => connection.ownerUserId === input.userId) ??
		connections.find((connection) => connection.ownerType === "workspace") ??
		null
	);
}

function gatewaySecret() {
	const secret = env.MCP_GATEWAY_SHARED_SECRET;
	if (!secret) {
		throw new Error(
			"MCP_GATEWAY_SHARED_SECRET is required for gateway-backed tool execution",
		);
	}
	return secret;
}

function signContext(encodedContext: string) {
	return createHmac("sha256", gatewaySecret())
		.update(encodedContext)
		.digest("hex");
}

function encryptionKey() {
	return createHash("sha256").update(gatewaySecret()).digest();
}

function encodeContext(payload: JsonRecord) {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
	const ciphertext = Buffer.concat([
		cipher.update(JSON.stringify(payload), "utf8"),
		cipher.final(),
	]);
	const envelope = {
		v: 1,
		alg: "A256GCM",
		iv: iv.toString("base64url"),
		ciphertext: ciphertext.toString("base64url"),
		tag: cipher.getAuthTag().toString("base64url"),
	};
	return Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
}

export function buildSignedToolContextHeaders(payload: JsonRecord) {
	const encoded = encodeContext(payload);
	return {
		[CONTEXT_HEADER]: encoded,
		[SIGNATURE_HEADER]: signContext(encoded),
	};
}

export async function resolveToolExecutionHeaders(
	input: ResolveToolExecutionHeadersInput,
) {
	const { connector, required } = await findConnectorForTool(input);
	if (!connector) return {};

	const settings = await findUserToolSettings(input);
	if (settings && !settings.enabled) {
		throw new Error("Tool disabled in user settings");
	}

	const connection = await findPreferredConnection(
		connector.id,
		input,
		settings,
	);
	if (!connection) {
		if (required) {
			throw new Error(
				`Tool connection required for connector '${connector.key}'`,
			);
		}
		return {};
	}

	const connectionSecrets = await decryptRecord(
		connection.encryptedSecretsJson,
	);
	const settingsSecrets = await decryptRecord(settings?.encryptedSecretsJson);
	const now = Date.now();
	const payload = {
		version: 1,
		workspaceId: input.workspaceId,
		userId: input.userId,
		connectorId: connector.id,
		connectorKey: connector.key,
		connectionId: connection.id,
		issuedAt: now,
		expiresAt: now + CONTEXT_TTL_MS,
		config: {
			...jsonRecord(connector.defaultConfigJson),
			...jsonRecord(connection.configJson),
		},
		settings: jsonRecord(settings?.configJson),
		secrets: {
			...connectionSecrets,
			...settingsSecrets,
		},
	};

	return buildSignedToolContextHeaders(payload);
}

export function toolContextHeaderNames() {
	return {
		context: CONTEXT_HEADER,
		signature: SIGNATURE_HEADER,
	} as const;
}
