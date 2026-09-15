import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { organizations, workspaces } from "./workspace";
import { conversations } from "./conversations";

export const genesysConnections = pgTable(
  "genesys_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .unique()
      .references(() => organizations.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    region: text("region").notNull(),
    integrationId: uuid("integration_id").notNull(),
    clientId: uuid("client_id").notNull(),
    encryptedSecrets: text("encrypted_secrets").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    validationError: text("validation_error"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("genesys_region_integration_unique").on(
      t.region,
      t.integrationId,
    ),
  ],
);
export const genesysProjects = pgTable("genesys_projects", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  connectionId: uuid("connection_id")
    .notNull()
    .references(() => genesysConnections.id, { onDelete: "cascade" }),
});
export const genesysSessions = pgTable(
  "genesys_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => genesysConnections.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").notNull(),
    userId: uuid("user_id").notNull(),
    externalConversationId: uuid("external_conversation_id"),
    state: text("state").notNull().default("requested"),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("genesys_active_conversation_unique")
      .on(t.conversationId)
      .where(sql`${t.state} <> 'resumed'`),
    index("genesys_sessions_connection_idx").on(t.connectionId),
    check(
      "genesys_session_state",
      sql`${t.state} in ('requested','waiting','human','closing','uncertain','failed','completed','resumed')`,
    ),
  ],
);
export const genesysDeliveries = pgTable(
  "genesys_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => genesysSessions.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").notNull(),
    externalId: text("external_id"),
    direction: text("direction").notNull(),
    encryptedText: text("encrypted_text").notNull(),
    state: text("state").notNull().default("queued"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("genesys_delivery_message_unique").on(t.sessionId, t.messageId),
    uniqueIndex("genesys_delivery_external_unique").on(
      t.sessionId,
      t.externalId,
    ),
    index("genesys_deliveries_pending_idx").on(t.state, t.createdAt),
    check(
      "genesys_delivery_state",
      sql`${t.state} in ('queued','sending','sent','failed','uncertain','cancelled')`,
    ),
    check(
      "genesys_delivery_direction",
      sql`${t.direction} in ('inbound','outbound')`,
    ),
  ],
);
