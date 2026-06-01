import { and, eq, sql } from "drizzle-orm";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
	agents,
	agentVersions,
	marketplaceInstalls,
	marketplaceItems,
	marketplaceItemVersions,
	marketplaceReviews,
} from "@/server/infrastructure/db/schema";

export interface AgentMarketplaceManifest {
	type: "agent";
	name: string;
	description?: string;
	agent: {
		systemPrompt?: string;
		recommendedModels?: string[];
		tools?: string[];
		mcpRequirements?: unknown[];
	};
	permissions?: Record<string, unknown>;
}

function slugify(value: string) {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 96);
}

export function listMarketplaceItems(input: {
	status?: string;
	includeDrafts?: boolean;
}) {
	if (input.status) {
		return db
			.select()
			.from(marketplaceItems)
			.where(eq(marketplaceItems.status, input.status as never))
			.orderBy(sql`${marketplaceItems.updatedAt} DESC`);
	}
	if (input.includeDrafts) {
		return db
			.select()
			.from(marketplaceItems)
			.orderBy(sql`${marketplaceItems.updatedAt} DESC`);
	}
	return db
		.select()
		.from(marketplaceItems)
		.where(eq(marketplaceItems.status, "published"))
		.orderBy(
			sql`${marketplaceItems.installCount} DESC, ${marketplaceItems.updatedAt} DESC`,
		);
}

export async function getMarketplaceItem(itemId: string) {
	const [item] = await db
		.select()
		.from(marketplaceItems)
		.where(eq(marketplaceItems.id, itemId))
		.limit(1);
	return item ?? null;
}

export async function getLatestVersion(itemId: string) {
	const [version] = await db
		.select()
		.from(marketplaceItemVersions)
		.where(eq(marketplaceItemVersions.itemId, itemId))
		.orderBy(sql`${marketplaceItemVersions.createdAt} DESC`)
		.limit(1);
	return version ?? null;
}

export async function publishAgentDraft(input: {
	workspaceId: string;
	userId: string;
	agentId: string;
	version: string;
	name?: string;
	description?: string;
	visibility?: "public" | "private" | "unlisted" | "organization";
}) {
	const [agent] = await db
		.select()
		.from(agents)
		.where(
			and(
				eq(agents.id, input.agentId),
				eq(agents.workspaceId, input.workspaceId),
			),
		)
		.limit(1);
	if (!agent) throw new Error("Agent not found");
	if (!agent.activeVersionId) throw new Error("Agent has no active version");

	const [activeVersion] = await db
		.select()
		.from(agentVersions)
		.where(eq(agentVersions.id, agent.activeVersionId))
		.limit(1);
	if (!activeVersion) throw new Error("Agent version not found");

	const name = input.name || agent.name;
	const manifest: AgentMarketplaceManifest = {
		type: "agent",
		name,
		description: input.description || agent.description || undefined,
		agent: {
			systemPrompt: activeVersion.systemPrompt || undefined,
			recommendedModels: [],
			tools: [],
			mcpRequirements: [],
		},
		permissions: { riskLevel: "moderate" },
	};

	const { item, version } = await db.transaction(async (tx) => {
		const [item] = await tx
			.insert(marketplaceItems)
			.values({
				publisherUserId: input.userId,
				publisherWorkspaceId: input.workspaceId,
				type: "agent",
				slug: `${slugify(name)}-${Date.now().toString(36)}`,
				name,
				description: input.description || agent.description,
				visibility: input.visibility ?? "private",
				status: "draft",
				pricingModel: "free",
			})
			.returning();

		const [version] = await tx
			.insert(marketplaceItemVersions)
			.values({
				itemId: item.id,
				version: input.version,
				manifestJson: manifest,
				changelog: "Initial marketplace draft",
				compatibilityJson: { app: "ai-hub", schema: 1 },
				requestedPermissionsJson: manifest.permissions,
				securityReviewStatus: "pending",
				createdById: input.userId,
			})
			.returning();

		await tx
			.update(marketplaceItems)
			.set({ latestVersionId: version.id, updatedAt: new Date() })
			.where(eq(marketplaceItems.id, item.id));
		return { item, version };
	});

	await audit.emit({
		workspaceId: input.workspaceId,
		actorPrincipalType: "user",
		actorPrincipalId: input.userId,
		action: "marketplace.draftCreated",
		resourceType: "marketplace_item",
		resourceId: item.id,
		outcome: "success",
		metadata: { agentId: input.agentId, versionId: version.id },
	});

	return { item, version };
}

export async function submitMarketplaceItem(itemId: string, userId: string) {
	const [item] = await db
		.update(marketplaceItems)
		.set({ status: "pending_review", updatedAt: new Date() })
		.where(eq(marketplaceItems.id, itemId))
		.returning();
	if (!item) throw new Error("Marketplace item not found");
	await audit.emit({
		workspaceId: item.publisherWorkspaceId ?? undefined,
		actorPrincipalType: "user",
		actorPrincipalId: userId,
		action: "marketplace.submitted",
		resourceType: "marketplace_item",
		resourceId: itemId,
		outcome: "success",
	});
	return item;
}

export async function reviewMarketplaceItem(input: {
	itemId: string;
	versionId?: string;
	reviewerUserId: string;
	status: "approved" | "rejected" | "changes_requested";
	notes?: string;
}) {
	const item = await getMarketplaceItem(input.itemId);
	if (!item) throw new Error("Marketplace item not found");
	const [review] = await db
		.insert(marketplaceReviews)
		.values({
			itemId: input.itemId,
			versionId: input.versionId || item.latestVersionId,
			reviewerUserId: input.reviewerUserId,
			status: input.status,
			notes: input.notes || null,
		})
		.returning();

	const nextStatus =
		input.status === "approved"
			? "published"
			: input.status === "rejected"
				? "rejected"
				: "draft";
	await db
		.update(marketplaceItems)
		.set({
			status: nextStatus,
			visibility: input.status === "approved" ? "public" : item.visibility,
			updatedAt: new Date(),
		})
		.where(eq(marketplaceItems.id, input.itemId));
	return review;
}

export async function installMarketplaceItem(input: {
	workspaceId: string;
	userId: string;
	itemId: string;
}) {
	const item = await getMarketplaceItem(input.itemId);
	if (!item || item.status !== "published")
		throw new Error("Marketplace item not available");
	const version = await getLatestVersion(item.id);
	if (!version) throw new Error("Marketplace item has no version");

	const manifest = version.manifestJson as AgentMarketplaceManifest;
	if (manifest.type !== "agent")
		throw new Error("Only agent marketplace installs are supported");

	const { installedAgent, install } = await db.transaction(async (tx) => {
		const [installedAgent] = await tx
			.insert(agents)
			.values({
				workspaceId: input.workspaceId,
				name: manifest.name,
				slug: `${slugify(manifest.name)}-${Date.now().toString(36)}`,
				description: manifest.description ?? item.description,
				visibility: "workspace",
				sourceType: "marketplace_install",
				marketplaceItemId: item.id,
				marketplaceVersionId: version.id,
				createdById: input.userId,
			})
			.returning();

		const [agentVersion] = await tx
			.insert(agentVersions)
			.values({
				agentId: installedAgent.id,
				versionNumber: 1,
				name: `Installed from marketplace ${version.version}`,
				systemPrompt: manifest.agent.systemPrompt ?? null,
				createdById: input.userId,
			})
			.returning();

		await tx
			.update(agents)
			.set({ activeVersionId: agentVersion.id })
			.where(eq(agents.id, installedAgent.id));
		const [install] = await tx
			.insert(marketplaceInstalls)
			.values({
				workspaceId: input.workspaceId,
				itemId: item.id,
				versionId: version.id,
				installedByUserId: input.userId,
				installedResourceType: "agent",
				installedResourceId: installedAgent.id,
			})
			.returning();
		await tx
			.update(marketplaceItems)
			.set({
				installCount: sql`${marketplaceItems.installCount} + 1`,
				updatedAt: new Date(),
			})
			.where(eq(marketplaceItems.id, item.id));
		return { installedAgent, install };
	});

	await audit.emit({
		workspaceId: input.workspaceId,
		actorPrincipalType: "user",
		actorPrincipalId: input.userId,
		action: "marketplace.installed",
		resourceType: "marketplace_item",
		resourceId: item.id,
		outcome: "success",
		metadata: { installedAgentId: installedAgent.id, installId: install.id },
	});

	return { agent: installedAgent, install };
}
