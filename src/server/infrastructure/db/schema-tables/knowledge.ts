import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  varchar,
  uuid,
  jsonb,
  vector,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { workspaces } from "./workspace";
import { agentVersions } from "./agents";

const CREATED_AT_COLUMN = "created_at";
const UPDATED_AT_COLUMN = "updated_at";
const CASCADE_ACTION = "cascade";
const CREATED_BY_USER_ID_COLUMN = "created_by_user_id";
const WORKSPACE_ID_COLUMN = "workspace_id";
const STATUS_COLUMN = "status";

// ─── Knowledge / RAG ──────────────────────────────────────────────────

export const knowledgeBases = pgTable(
  "knowledge_bases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid(WORKSPACE_ID_COLUMN)
      .notNull()
      .references(() => workspaces.id, { onDelete: CASCADE_ACTION }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    isGlobal: boolean("is_global").notNull().default(false),
    createdById: uuid(CREATED_BY_USER_ID_COLUMN)
      .notNull()
      .references(() => users.id),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("knowledge_bases_workspace").on(t.workspaceId)],
);

export const documentSourceEnum = pgEnum("document_source_type", [
  "upload",
  "url",
  "text",
  "integration",
]);
export const documentStatusEnum = pgEnum("document_status", [
  "pending",
  "processing",
  "ready",
  "failed",
]);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid(WORKSPACE_ID_COLUMN)
      .notNull()
      .references(() => workspaces.id, { onDelete: CASCADE_ACTION }),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: CASCADE_ACTION }),
    title: varchar("title", { length: 512 }).notNull(),
    sourceType: documentSourceEnum("source_type").notNull(),
    objectStorageKey: text("object_storage_key"),
    mimeType: varchar("mime_type", { length: 128 }),
    status: documentStatusEnum(STATUS_COLUMN).notNull().default("pending"),
    errorMessage: text("error_message"),
    createdById: uuid(CREATED_BY_USER_ID_COLUMN)
      .notNull()
      .references(() => users.id),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("documents_knowledge_base").on(t.knowledgeBaseId)],
);

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: CASCADE_ACTION }),
    chunkIndex: integer("chunk_index").notNull(),
    contentEncrypted: text("content_encrypted"),
    tokenCount: integer("token_count"),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("document_chunks_document").on(t.documentId, t.chunkIndex)],
);

export const documentEmbeddings = pgTable(
  "document_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chunkId: uuid("chunk_id")
      .notNull()
      .references(() => documentChunks.id, { onDelete: CASCADE_ACTION }),
    embedding: vector("embedding", { dimensions: 1536 }),
    embeddingModelId: varchar("embedding_model_id", { length: 255 }),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("document_embeddings_chunk_unique").on(t.chunkId)],
);

export const agentKnowledgeBindings = pgTable(
  "agent_knowledge_bindings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentVersionId: uuid("agent_version_id")
      .notNull()
      .references(() => agentVersions.id, { onDelete: CASCADE_ACTION }),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: CASCADE_ACTION }),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("agent_knowledge_bindings_unique").on(
      t.agentVersionId,
      t.knowledgeBaseId,
    ),
  ],
);

export const agentSkills = pgTable(
  "agent_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid(WORKSPACE_ID_COLUMN)
      .notNull()
      .references(() => workspaces.id, { onDelete: CASCADE_ACTION }),
    createdById: uuid(CREATED_BY_USER_ID_COLUMN)
      .notNull()
      .references(() => users.id),
    isGlobal: boolean("is_global").notNull().default(false),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    sourcePackage: text("source_package"),
    sourceSkillName: varchar("source_skill_name", { length: 255 }),
    installCommand: text("install_command"),
    markdownFilesJson: jsonb("markdown_files_json").notNull(),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("agent_skills_workspace").on(t.workspaceId)],
);

export const agentSkillBindings = pgTable(
  "agent_skill_bindings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentVersionId: uuid("agent_version_id")
      .notNull()
      .references(() => agentVersions.id, { onDelete: CASCADE_ACTION }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => agentSkills.id, { onDelete: CASCADE_ACTION }),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("agent_skill_bindings_unique").on(t.agentVersionId, t.skillId),
  ],
);
