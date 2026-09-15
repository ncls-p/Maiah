import {
  integer,
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  primaryKey,
} from "drizzle-orm/pg-core";
import { mcpServers } from "./mcp";
import { users } from "./auth";
export const mcpOauthConfigs = pgTable("mcp_oauth_configs", {
  serverId: uuid("server_id")
    .primaryKey()
    .references(() => mcpServers.id, { onDelete: "cascade" }),
  clientId: text("client_id"),
  encryptedClientSecret: text("encrypted_client_secret"),
  scopes: text("scopes").notNull().default(""),
  dynamicRegistration: boolean("dynamic_registration").notNull().default(false),
  revision: uuid("revision").notNull().defaultRandom(),
});
export const mcpOauthCredentials = pgTable(
  "mcp_oauth_credentials",
  {
    serverId: uuid("server_id")
      .notNull()
      .references(() => mcpOauthConfigs.serverId, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    encryptedData: text("encrypted_data").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.serverId, t.userId] })],
);
export const mcpOauthAttempts = pgTable("mcp_oauth_attempts", {
  stateHash: text("state_hash").primaryKey(),
  serverId: uuid("server_id")
    .notNull()
    .references(() => mcpOauthConfigs.serverId, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull(),
  encryptedData: text("encrypted_data").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const mcpSyncState = pgTable("mcp_sync_state", {
  serverId: uuid("server_id")
    .primaryKey()
    .references(() => mcpServers.id, { onDelete: "cascade" }),
  nextSyncAt: timestamp("next_sync_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  leaseId: uuid("lease_id"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  failures: integer("failures").notNull().default(0),
  lastError: text("last_error"),
});
