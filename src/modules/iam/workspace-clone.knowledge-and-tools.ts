import {
  agentSkills,
  customTools,
  documentChunks,
  documentEmbeddings,
  documents,
  knowledgeBases,
  toolConnectionRequirements,
  userToolSettings,
} from "@/server/infrastructure/db/schema";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { WorkspaceCloneContext } from "./workspace-clone.context";

export async function cloneKnowledgeAndTools(context: WorkspaceCloneContext) {
  const {
    tx,
    input,
    disableSecrets,
    skillMap,
    knowledgeMap,
    documentMap,
    customToolMap,
    connectorMap,
    mcpToolMap,
    connectionMap,
  } = context;
  const sourceSkills = await tx
    .select()
    .from(agentSkills)
    .where(eq(agentSkills.workspaceId, input.sourceWorkspaceId));
  for (const source of sourceSkills) {
    const id = randomUUID();
    skillMap.set(source.id, id);
    await tx.insert(agentSkills).values({
      ...source,
      id,
      workspaceId: input.targetWorkspaceId,
      createdById: input.actorUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const sourceKnowledge = await tx
    .select()
    .from(knowledgeBases)
    .where(eq(knowledgeBases.workspaceId, input.sourceWorkspaceId));
  for (const source of sourceKnowledge) {
    const id = randomUUID();
    knowledgeMap.set(source.id, id);
    await tx.insert(knowledgeBases).values({
      ...source,
      id,
      workspaceId: input.targetWorkspaceId,
      createdById: input.actorUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  if (sourceKnowledge.length > 0) {
    const sourceDocuments = await tx
      .select()
      .from(documents)
      .where(
        inArray(
          documents.knowledgeBaseId,
          sourceKnowledge.map(({ id }) => id),
        ),
      );
    for (const source of sourceDocuments) {
      const id = randomUUID();
      documentMap.set(source.id, id);
      await tx.insert(documents).values({
        ...source,
        id,
        workspaceId: input.targetWorkspaceId,
        knowledgeBaseId: knowledgeMap.get(source.knowledgeBaseId)!,
        createdById: input.actorUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    if (sourceDocuments.length > 0) {
      const sourceChunks = await tx
        .select()
        .from(documentChunks)
        .where(
          inArray(
            documentChunks.documentId,
            sourceDocuments.map(({ id }) => id),
          ),
        );
      for (const source of sourceChunks) {
        const chunkId = randomUUID();
        await tx.insert(documentChunks).values({
          ...source,
          id: chunkId,
          documentId: documentMap.get(source.documentId)!,
          createdAt: new Date(),
        });
        const [embedding] = await tx
          .select()
          .from(documentEmbeddings)
          .where(eq(documentEmbeddings.chunkId, source.id))
          .limit(1);
        if (embedding) {
          await tx.insert(documentEmbeddings).values({
            ...embedding,
            id: randomUUID(),
            chunkId,
            createdAt: new Date(),
          });
        }
      }
    }
  }

  const sourceCustomTools = await tx
    .select()
    .from(customTools)
    .where(eq(customTools.workspaceId, input.sourceWorkspaceId));
  for (const source of sourceCustomTools) {
    const id = randomUUID();
    customToolMap.set(source.id, id);
    await tx.insert(customTools).values({
      ...source,
      id,
      workspaceId: input.targetWorkspaceId,
      status: disableSecrets ? "disabled" : source.status,
      createdById: input.actorUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  for (const source of context.pendingRequirements) {
    await tx.insert(toolConnectionRequirements).values({
      ...source,
      id: randomUUID(),
      workspaceId: input.targetWorkspaceId,
      connectorId: connectorMap.get(source.connectorId)!,
      toolId:
        mcpToolMap.get(source.toolId) ??
        customToolMap.get(source.toolId) ??
        source.toolId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  const sourceToolSettings = await tx
    .select()
    .from(userToolSettings)
    .where(eq(userToolSettings.workspaceId, input.sourceWorkspaceId));
  for (const source of sourceToolSettings) {
    await tx
      .insert(userToolSettings)
      .values({
        ...source,
        id: randomUUID(),
        workspaceId: input.targetWorkspaceId,
        toolId:
          mcpToolMap.get(source.toolId) ??
          customToolMap.get(source.toolId) ??
          source.toolId,
        connectionId: source.connectionId
          ? (connectionMap.get(source.connectionId) ?? null)
          : null,
        encryptedSecretsJson: disableSecrets
          ? null
          : source.encryptedSecretsJson,
        enabled: disableSecrets ? false : source.enabled,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }
}
