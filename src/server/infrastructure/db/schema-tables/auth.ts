import {
  pgTable,
  text,
  timestamp,
  boolean,
  varchar,
  uuid,
  jsonb,
} from "drizzle-orm/pg-core";

const CREATED_AT_COLUMN = "created_at";
const UPDATED_AT_COLUMN = "updated_at";
const SET_NULL_ACTION = "set null";
const USER_ID_COLUMN = "user_id";
const CASCADE_ACTION = "cascade";

// ─── Better Auth tables ────────────────────────────────────────────────

export const users = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: varchar("role", { length: 64 }),
  banned: boolean("banned").notNull().default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
  createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable("session", {
  id: uuid("id").primaryKey().defaultRandom(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
    .notNull()
    .defaultNow(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  impersonatedBy: uuid("impersonated_by").references(() => users.id, {
    onDelete: SET_NULL_ACTION,
  }),
  userId: uuid(USER_ID_COLUMN)
    .notNull()
    .references(() => users.id, { onDelete: CASCADE_ACTION }),
});

export const accounts = pgTable("account", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid(USER_ID_COLUMN)
    .notNull()
    .references(() => users.id, { onDelete: CASCADE_ACTION }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const verifications = pgTable("verification", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true }),
  updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true }),
});

export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 128 }).primaryKey(),
  valueJson: jsonb("value_json").notNull(),
  updatedById: uuid("updated_by_user_id").references(() => users.id, {
    onDelete: SET_NULL_ACTION,
  }),
  updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
    .notNull()
    .defaultNow(),
});
