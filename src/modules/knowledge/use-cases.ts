import { and, eq, isNull, sql } from "drizzle-orm";
import { encryptValue, decryptValue } from "@/lib/crypto";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
	documentChunks,
	documents,
	knowledgeBases,
} from "@/server/infrastructure/db/schema";

export interface CreateKnowledgeBaseInput {
	workspaceId: string;
	userId: string;
	name: string;
	description?: string;
}

export async function createKnowledgeBase(input: CreateKnowledgeBaseInput) {
	const [knowledgeBase] = await db
		.insert(knowledgeBases)
		.values({
			workspaceId: input.workspaceId,
			name: input.name,
			description: input.description || null,
			createdById: input.userId,
		})
		.returning();

	await audit.emit({
		workspaceId: input.workspaceId,
		actorPrincipalType: "user",
		actorPrincipalId: input.userId,
		action: "knowledgeBase.created",
		resourceType: "knowledge_base",
		resourceId: knowledgeBase.id,
		outcome: "success",
		metadata: { name: input.name },
	});

	return knowledgeBase;
}

export async function listKnowledgeBases(workspaceId: string) {
	return db
		.select()
		.from(knowledgeBases)
		.where(
			and(
				eq(knowledgeBases.workspaceId, workspaceId),
				isNull(knowledgeBases.archivedAt),
			),
		)
		.orderBy(sql`${knowledgeBases.createdAt} DESC`);
}

export async function getKnowledgeBase(
	knowledgeBaseId: string,
	workspaceId: string,
) {
	const [knowledgeBase] = await db
		.select()
		.from(knowledgeBases)
		.where(
			and(
				eq(knowledgeBases.id, knowledgeBaseId),
				eq(knowledgeBases.workspaceId, workspaceId),
				isNull(knowledgeBases.archivedAt),
			),
		)
		.limit(1);
	return knowledgeBase ?? null;
}

export async function updateKnowledgeBase(input: {
	knowledgeBaseId: string;
	workspaceId: string;
	userId: string;
	name?: string;
	description?: string;
}) {
	const existing = await getKnowledgeBase(
		input.knowledgeBaseId,
		input.workspaceId,
	);
	if (!existing) throw new Error("Knowledge base not found");

	const updates: Record<string, unknown> = { updatedAt: new Date() };
	if (input.name !== undefined) updates.name = input.name;
	if (input.description !== undefined)
		updates.description = input.description || null;

	const [knowledgeBase] = await db
		.update(knowledgeBases)
		.set(updates)
		.where(eq(knowledgeBases.id, input.knowledgeBaseId))
		.returning();

	await audit.emit({
		workspaceId: input.workspaceId,
		actorPrincipalType: "user",
		actorPrincipalId: input.userId,
		action: "knowledgeBase.updated",
		resourceType: "knowledge_base",
		resourceId: input.knowledgeBaseId,
		outcome: "success",
	});

	return knowledgeBase;
}

export async function archiveKnowledgeBase(
	knowledgeBaseId: string,
	workspaceId: string,
	userId: string,
) {
	const existing = await getKnowledgeBase(knowledgeBaseId, workspaceId);
	if (!existing) throw new Error("Knowledge base not found");
	await db
		.update(knowledgeBases)
		.set({ archivedAt: new Date(), updatedAt: new Date() })
		.where(eq(knowledgeBases.id, knowledgeBaseId));
	await audit.emit({
		workspaceId,
		actorPrincipalType: "user",
		actorPrincipalId: userId,
		action: "knowledgeBase.archived",
		resourceType: "knowledge_base",
		resourceId: knowledgeBaseId,
		outcome: "success",
	});
}

function chunkText(text: string, maxChars = 1_200) {
	const normalized = text.replace(/\r\n/g, "\n").trim();
	if (!normalized) return [];
	const paragraphs = normalized.split(/\n{2,}/);
	const chunks: string[] = [];
	let current = "";
	for (const paragraph of paragraphs) {
		if (`${current}\n\n${paragraph}`.length > maxChars && current) {
			chunks.push(current.trim());
			current = paragraph;
		} else {
			current = current ? `${current}\n\n${paragraph}` : paragraph;
		}
	}
	if (current.trim()) chunks.push(current.trim());
	return chunks.flatMap((chunk) => {
		if (chunk.length <= maxChars) return [chunk];
		const split: string[] = [];
		for (let index = 0; index < chunk.length; index += maxChars) {
			split.push(chunk.slice(index, index + maxChars));
		}
		return split;
	});
}

export async function ingestTextDocument(input: {
	workspaceId: string;
	knowledgeBaseId: string;
	userId: string;
	title: string;
	content: string;
	sourceType?: "text" | "url";
}) {
	const knowledgeBase = await getKnowledgeBase(
		input.knowledgeBaseId,
		input.workspaceId,
	);
	if (!knowledgeBase) throw new Error("Knowledge base not found");

	const chunks = chunkText(input.content);
	const document = await db.transaction(async (tx) => {
		const [document] = await tx
			.insert(documents)
			.values({
				workspaceId: input.workspaceId,
				knowledgeBaseId: input.knowledgeBaseId,
				title: input.title,
				sourceType: input.sourceType ?? "text",
				mimeType: "text/plain",
				status: "processing",
				createdById: input.userId,
			})
			.returning();

		if (chunks.length > 0) {
			await tx.insert(documentChunks).values(
				await Promise.all(
					chunks.map(async (chunk, index) => ({
						documentId: document.id,
						chunkIndex: index,
						contentEncrypted: await encryptValue(chunk),
						tokenCount: Math.ceil(chunk.length / 4),
						metadataJson: { source: input.sourceType ?? "text" },
					})),
				),
			);
		}

		const [updated] = await tx
			.update(documents)
			.set({
				status: chunks.length > 0 ? "ready" : "failed",
				errorMessage: chunks.length > 0 ? null : "Document was empty",
				updatedAt: new Date(),
			})
			.where(eq(documents.id, document.id))
			.returning();
		return updated;
	});

	await audit.emit({
		workspaceId: input.workspaceId,
		actorPrincipalType: "user",
		actorPrincipalId: input.userId,
		action: "document.ingested",
		resourceType: "knowledge_base",
		resourceId: input.knowledgeBaseId,
		outcome: document.status === "ready" ? "success" : "failed",
		metadata: { documentId: document.id, chunks: chunks.length },
	});

	return document;
}

export async function listDocuments(
	knowledgeBaseId: string,
	workspaceId: string,
) {
	const knowledgeBase = await getKnowledgeBase(knowledgeBaseId, workspaceId);
	if (!knowledgeBase) throw new Error("Knowledge base not found");
	return db
		.select()
		.from(documents)
		.where(
			and(
				eq(documents.knowledgeBaseId, knowledgeBaseId),
				eq(documents.workspaceId, workspaceId),
			),
		)
		.orderBy(sql`${documents.createdAt} DESC`);
}

function scoreContent(content: string, query: string) {
	const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
	const lower = content.toLowerCase();
	return terms.reduce(
		(score, term) => score + (lower.includes(term) ? 1 : 0),
		0,
	);
}

export async function searchKnowledgeBase(input: {
	workspaceId: string;
	knowledgeBaseId: string;
	query: string;
	limit?: number;
}) {
	const knowledgeBase = await getKnowledgeBase(
		input.knowledgeBaseId,
		input.workspaceId,
	);
	if (!knowledgeBase) throw new Error("Knowledge base not found");

	const rows = await db
		.select({ chunk: documentChunks, document: documents })
		.from(documentChunks)
		.innerJoin(documents, eq(documentChunks.documentId, documents.id))
		.where(
			and(
				eq(documents.knowledgeBaseId, input.knowledgeBaseId),
				eq(documents.workspaceId, input.workspaceId),
				eq(documents.status, "ready"),
			),
		);

	const results = [] as Array<{
		documentId: string;
		documentTitle: string;
		chunkId: string;
		chunkIndex: number;
		content: string;
		score: number;
	}>;
	for (const row of rows) {
		if (!row.chunk.contentEncrypted) continue;
		const content = await decryptValue(row.chunk.contentEncrypted);
		const score = scoreContent(content, input.query);
		if (score > 0) {
			results.push({
				documentId: row.document.id,
				documentTitle: row.document.title,
				chunkId: row.chunk.id,
				chunkIndex: row.chunk.chunkIndex,
				content,
				score,
			});
		}
	}

	return results.sort((a, b) => b.score - a.score).slice(0, input.limit ?? 5);
}
