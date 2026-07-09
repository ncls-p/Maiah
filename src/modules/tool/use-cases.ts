import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { encryptValue } from "@/lib/crypto";
import { logHandledError } from "@/lib/logger";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
	agentToolBindings,
	agentVersions,
	customTools,
	mcpServers,
	mcpTools,
	toolInvocations,
} from "@/server/infrastructure/db/schema";
import { getBuiltInTool, requiresApproval } from "./builtin-tools";

export const toolBindingInputSchema = z.discriminatedUnion("toolSource", [
	z.object({
		toolSource: z.literal("builtin"),
		toolId: z.uuid(),
		requireApproval: z.boolean().optional(),
	}),
	z.object({
		toolSource: z.literal("mcp"),
		toolId: z.uuid(),
		mcpServerId: z.uuid(),
		requireApproval: z.boolean().optional(),
	}),
	z.object({
		toolSource: z.literal("custom"),
		toolId: z.uuid(),
		requireApproval: z.boolean().optional(),
	}),
]);

export type ToolBindingInput = z.infer<typeof toolBindingInputSchema>;
type BindingDb = Pick<typeof db, "select" | "insert" | "delete">;

export async function getToolBindingsForVersion(
	agentVersionId: string,
	visibility?: { workspaceId: string; userId: string },
	executor: BindingDb = db,
) {
	const bindings = await executor
		.select()
		.from(agentToolBindings)
		.where(eq(agentToolBindings.agentVersionId, agentVersionId));
	if (!visibility) return bindings;

	const customToolIds = bindings
		.filter((binding) => binding.toolSource === "custom")
		.map((binding) => binding.toolId);
	const mcpToolIds = bindings
		.filter((binding) => binding.toolSource === "mcp")
		.map((binding) => binding.toolId);

	const [visibleCustomTools, visibleMcpTools] = await Promise.all([
		customToolIds.length > 0
			? executor
					.select({ id: customTools.id })
					.from(customTools)
					.where(
						and(
							inArray(customTools.id, customToolIds),
							eq(customTools.workspaceId, visibility.workspaceId),
							isNull(customTools.archivedAt),
							or(
								eq(customTools.createdById, visibility.userId),
								eq(customTools.isGlobal, true),
							),
						),
					)
			: Promise.resolve([]),
		mcpToolIds.length > 0
			? executor
					.select({ id: mcpTools.id })
					.from(mcpTools)
					.innerJoin(mcpServers, eq(mcpTools.mcpServerId, mcpServers.id))
					.where(
						and(
							inArray(mcpTools.id, mcpToolIds),
							eq(mcpServers.workspaceId, visibility.workspaceId),
							isNull(mcpServers.archivedAt),
							or(
								eq(mcpServers.createdById, visibility.userId),
								eq(mcpServers.isGlobal, true),
							),
						),
					)
			: Promise.resolve([]),
	]);

	const visibleCustomToolIds = new Set(
		visibleCustomTools.map((tool) => tool.id),
	);
	const visibleMcpToolIds = new Set(visibleMcpTools.map((tool) => tool.id));

	return bindings.filter((binding) => {
		if (binding.toolSource === "builtin") return true;
		if (binding.toolSource === "custom") {
			return visibleCustomToolIds.has(binding.toolId);
		}
		if (binding.toolSource === "mcp") {
			return visibleMcpToolIds.has(binding.toolId);
		}
		return false;
	});
}

export async function replaceToolBindingsForVersion(
	agentVersionId: string,
	bindings: ToolBindingInput[],
	workspaceId?: string,
	options?: { userId?: string },
	executor: BindingDb = db,
) {
	await executor
		.delete(agentToolBindings)
		.where(eq(agentToolBindings.agentVersionId, agentVersionId));
	await insertToolBindingsForVersion(
		agentVersionId,
		bindings,
		workspaceId,
		options,
		executor,
	);
}

export async function insertToolBindingsForVersion(
	agentVersionId: string,
	bindings: ToolBindingInput[],
	workspaceId?: string,
	options?: { userId?: string },
	executor: BindingDb = db,
) {
	if (bindings.length === 0) return;

	try {
		const values = await Promise.all(
			bindings.map(async (binding) => {
				if (binding.toolSource === "custom") {
					const customToolFilters = workspaceId
						? and(
								eq(customTools.id, binding.toolId),
								eq(customTools.workspaceId, workspaceId),
								isNull(customTools.archivedAt),
								options?.userId
									? or(
											eq(customTools.createdById, options.userId),
											eq(customTools.isGlobal, true),
										)
									: undefined,
							)
						: eq(customTools.id, binding.toolId);
					const [customTool] = await executor
						.select()
						.from(customTools)
						.where(customToolFilters)
						.limit(1);
					if (!customTool) throw new Error("Custom tool not found");

					return {
						agentVersionId,
						toolSource: "custom" as const,
						toolId: binding.toolId,
						requireApproval: binding.requireApproval ?? true,
						riskLevel: "medium",
					};
				}

				if (binding.toolSource === "mcp") {
					const [tool] = workspaceId
						? await executor
								.select({ requireApproval: mcpTools.requireApproval })
								.from(mcpTools)
								.innerJoin(mcpServers, eq(mcpTools.mcpServerId, mcpServers.id))
								.where(
									and(
										eq(mcpTools.id, binding.toolId),
										eq(mcpTools.mcpServerId, binding.mcpServerId),
										eq(mcpServers.workspaceId, workspaceId),
										eq(mcpServers.enabled, true),
										isNull(mcpServers.archivedAt),
										options?.userId
											? or(
													eq(mcpServers.createdById, options.userId),
													eq(mcpServers.isGlobal, true),
												)
											: undefined,
									),
								)
								.limit(1)
						: await executor
								.select()
								.from(mcpTools)
								.where(
									and(
										eq(mcpTools.id, binding.toolId),
										eq(mcpTools.mcpServerId, binding.mcpServerId),
									),
								)
								.limit(1);
					if (!tool) throw new Error("MCP tool not found");

					return {
						agentVersionId,
						toolSource: "mcp" as const,
						toolId: binding.toolId,
						requireApproval: binding.requireApproval ?? tool.requireApproval,
						riskLevel: "medium",
					};
				}

				const tool = getBuiltInTool(binding.toolId);
				if (!tool) throw new Error("Tool not found");

				return {
					agentVersionId,
					toolSource: "builtin" as const,
					toolId: binding.toolId,
					requireApproval:
						binding.requireApproval ?? requiresApproval(tool.riskLevel),
					riskLevel: tool.riskLevel,
				};
			}),
		);

		await executor
			.insert(agentToolBindings)
			.values(values)
			.onConflictDoNothing();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (
			![
				"Custom tool not found",
				"MCP tool not found",
				"Tool not found",
			].includes(message)
		) {
			logHandledError(
				"Failed to insert tool bindings",
				{ agentVersionId },
				error as Error,
			);
		}
		throw error;
	}
}

export async function cloneToolBindings(
	fromAgentVersionId: string | null,
	toAgentVersionId: string,
	workspaceId?: string,
	options?: { userId?: string },
	executor: BindingDb = db,
) {
	if (!fromAgentVersionId) return;
	const existing = await getToolBindingsForVersion(
		fromAgentVersionId,
		undefined,
		executor,
	);
	const inputs: ToolBindingInput[] = [];

	for (const binding of existing) {
		if (binding.toolSource === "custom") {
			inputs.push({
				toolSource: "custom",
				toolId: binding.toolId,
				requireApproval: binding.requireApproval,
			});
			continue;
		}

		if (binding.toolSource === "mcp") {
			const [tool] = await executor
				.select({ mcpServerId: mcpTools.mcpServerId })
				.from(mcpTools)
				.where(eq(mcpTools.id, binding.toolId))
				.limit(1);
			if (!tool) continue;
			inputs.push({
				toolSource: "mcp",
				toolId: binding.toolId,
				mcpServerId: tool.mcpServerId,
				requireApproval: binding.requireApproval,
			});
			continue;
		}

		inputs.push({
			toolSource: "builtin",
			toolId: binding.toolId,
			requireApproval: binding.requireApproval,
		});
	}

	await insertToolBindingsForVersion(
		toAgentVersionId,
		inputs,
		workspaceId,
		options,
		executor,
	);
}

export async function getCustomBindingContext(
	agentVersionId: string,
	toolId: string,
	userId: string,
	workspaceId: string,
) {
	const [binding] = await db
		.select()
		.from(agentToolBindings)
		.where(
			and(
				eq(agentToolBindings.agentVersionId, agentVersionId),
				eq(agentToolBindings.toolId, toolId),
				eq(agentToolBindings.toolSource, "custom"),
			),
		)
		.limit(1);

	if (!binding) return null;

	const [tool] = await db
		.select()
		.from(customTools)
		.where(
			and(
				eq(customTools.id, toolId),
				eq(customTools.workspaceId, workspaceId),
				isNull(customTools.archivedAt),
				or(eq(customTools.createdById, userId), eq(customTools.isGlobal, true)),
			),
		)
		.limit(1);

	return tool ? { binding, tool } : null;
}

export async function getMcpBindingContext(
	agentVersionId: string,
	toolId: string,
	userId?: string,
	workspaceId?: string,
) {
	const [binding] = await db
		.select()
		.from(agentToolBindings)
		.where(
			and(
				eq(agentToolBindings.agentVersionId, agentVersionId),
				eq(agentToolBindings.toolId, toolId),
				eq(agentToolBindings.toolSource, "mcp"),
			),
		)
		.limit(1);

	if (!binding) return null;

	const [tool] = await db
		.select()
		.from(mcpTools)
		.where(eq(mcpTools.id, toolId))
		.limit(1);

	if (!tool) return null;

	const [server] = await db
		.select()
		.from(mcpServers)
		.where(
			and(
				eq(mcpServers.id, tool.mcpServerId),
				workspaceId ? eq(mcpServers.workspaceId, workspaceId) : undefined,
				isNull(mcpServers.archivedAt),
				userId
					? or(
							eq(mcpServers.createdById, userId),
							eq(mcpServers.isGlobal, true),
						)
					: undefined,
			),
		)
		.limit(1);

	return server ? { binding, tool, server } : null;
}

export async function logToolInvocation(input: {
	workspaceId: string;
	conversationId?: string;
	messageId?: string;
	toolSource: string;
	toolId: string;
	toolName: string;
	riskLevel?: string | null;
	input: unknown;
	output?: unknown;
	status: string;
	latencyMs?: number;
	errorMessage?: string;
	approvedByUserId?: string;
}) {
	const [invocation] = await db
		.insert(toolInvocations)
		.values({
			workspaceId: input.workspaceId,
			conversationId: input.conversationId ?? null,
			messageId: input.messageId ?? null,
			toolSource: input.toolSource,
			toolId: input.toolId,
			toolName: input.toolName,
			riskLevel: input.riskLevel ?? null,
			inputJsonEncrypted: await encryptValue(
				JSON.stringify(input.input ?? null),
			),
			outputJsonEncrypted:
				input.output === undefined
					? null
					: await encryptValue(JSON.stringify(input.output)),
			status: input.status,
			latencyMs: input.latencyMs ?? null,
			errorMessage: input.errorMessage ?? null,
			approvedByUserId: input.approvedByUserId ?? null,
			completedAt:
				input.status === "success" || input.status === "failed"
					? new Date()
					: null,
		})
		.returning();

	return invocation;
}

export async function canExecuteRestrictedTool(
	userId: string,
	workspaceId: string,
) {
	return authorization.hasPermission(
		{ principalType: "user", principalId: userId },
		"tools.executeRestricted",
		"workspace",
		workspaceId,
	);
}

export async function getAgentVersionToolContext(agentVersionId: string) {
	const [version] = await db
		.select({ agentId: agentVersions.agentId })
		.from(agentVersions)
		.where(eq(agentVersions.id, agentVersionId))
		.limit(1);

	if (!version) throw new Error("Agent version not found");

	const bindings = await db
		.select()
		.from(agentToolBindings)
		.where(
			and(
				eq(agentToolBindings.agentVersionId, agentVersionId),
				eq(agentToolBindings.toolSource, "builtin"),
			),
		);

	return { version, bindings };
}
