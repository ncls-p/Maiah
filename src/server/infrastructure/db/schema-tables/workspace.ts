import {
  pgTable,
  text,
  timestamp,
  varchar,
  uuid,
  jsonb,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

const CREATED_AT_COLUMN = "created_at";
const UPDATED_AT_COLUMN = "updated_at";
const CASCADE_ACTION = "cascade";
const USER_ID_COLUMN = "user_id";
const CREATED_BY_USER_ID_COLUMN = "created_by_user_id";
const WORKSPACE_ID_COLUMN = "workspace_id";
const STATUS_COLUMN = "status";

// ─── Organization & Workspace ──────────────────────────────────────────

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 128 }).notNull().unique(),
  createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: CASCADE_ACTION }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 128 }).notNull(),
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
  (t) => [
    uniqueIndex("workspaces_org_slug_unique").on(t.organizationId, t.slug),
  ],
);

export const workspaceMemberStatusEnum = pgEnum("workspace_member_status", [
  "active",
  "suspended",
  "removed",
]);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid(WORKSPACE_ID_COLUMN)
      .notNull()
      .references(() => workspaces.id, { onDelete: CASCADE_ACTION }),
    userId: uuid(USER_ID_COLUMN)
      .notNull()
      .references(() => users.id, { onDelete: CASCADE_ACTION }),
    status: workspaceMemberStatusEnum(STATUS_COLUMN)
      .notNull()
      .default("active"),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("workspace_members_ws_user_unique").on(t.workspaceId, t.userId),
  ],
);

export const workspaceInvitations = pgTable("workspace_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid(WORKSPACE_ID_COLUMN)
    .notNull()
    .references(() => workspaces.id, { onDelete: CASCADE_ACTION }),
  email: varchar("email", { length: 255 }).notNull(),
  invitedById: uuid("invited_by_user_id")
    .notNull()
    .references(() => users.id),
  roleIdsJson: jsonb("role_ids_json"),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
    .notNull()
    .defaultNow(),
});
