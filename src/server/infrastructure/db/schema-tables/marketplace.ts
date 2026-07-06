import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  varchar,
  uuid,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { workspaces } from "./workspace";

const CREATED_AT_COLUMN = "created_at";
const UPDATED_AT_COLUMN = "updated_at";
const CASCADE_ACTION = "cascade";
const CREATED_BY_USER_ID_COLUMN = "created_by_user_id";
const WORKSPACE_ID_COLUMN = "workspace_id";
const USER_ID_COLUMN = "user_id";
const STATUS_COLUMN = "status";

// ─── Marketplace ───────────────────────────────────────────────────────

export const marketplaceItemTypeEnum = pgEnum("marketplace_item_type", [
  "agent",
  "prompt_template",
  "tool_pack",
  "mcp_preset",
  "workflow_template",
  "knowledge_template",
  "provider_preset",
  "skill",
  "custom_tool",
]);

export const marketplaceItemStatusEnum = pgEnum("marketplace_item_status", [
  "draft",
  "pending_review",
  "published",
  "rejected",
  "suspended",
  "archived",
]);

export const marketplaceItemVisibilityEnum = pgEnum(
  "marketplace_item_visibility",
  ["public", "private"],
);

export const marketplacePricingModelEnum = pgEnum("marketplace_pricing_model", [
  "free",
  "one_time",
  "subscription",
  "usage_based",
]);

export const marketplaceItems = pgTable(
  "marketplace_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publisherUserId: uuid("publisher_user_id")
      .notNull()
      .references(() => users.id),
    publisherWorkspaceId: uuid("publisher_workspace_id").references(
      () => workspaces.id,
    ),
    type: marketplaceItemTypeEnum("type").notNull(),
    slug: varchar("slug", { length: 128 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    visibility: marketplaceItemVisibilityEnum("visibility")
      .notNull()
      .default("private"),
    status: marketplaceItemStatusEnum(STATUS_COLUMN).notNull().default("draft"),
    latestVersionId: uuid("latest_version_id"),
    installCount: integer("install_count").notNull().default(0),
    ratingAverage: text("rating_average"),
    pricingModel: marketplacePricingModelEnum("pricing_model")
      .notNull()
      .default("free"),
    verifiedPublisher: boolean("verified_publisher").notNull().default(false),
    isFeatured: boolean("is_featured").notNull().default(false),
    featuredOrder: integer("featured_order"),
    featuredAt: timestamp("featured_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    totalDownloads: integer("total_downloads").notNull().default(0),
    tagsJson: jsonb("tags_json"),
    sourceResourceType: varchar("source_resource_type", { length: 32 }),
    sourceResourceId: uuid("source_resource_id"),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("marketplace_items_featured").on(t.isFeatured, t.featuredOrder),
    index("marketplace_items_type").on(t.type),
    index("marketplace_items_published").on(
      t.status,
      t.visibility,
      t.publishedAt,
    ),
    index("marketplace_items_source_resource").on(
      t.sourceResourceType,
      t.sourceResourceId,
    ),
  ],
);

export const marketplaceItemVersions = pgTable(
  "marketplace_item_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => marketplaceItems.id, { onDelete: CASCADE_ACTION }),
    version: varchar("version", { length: 32 }).notNull(),
    manifestJson: jsonb("manifest_json").notNull(),
    changelog: text("changelog"),
    compatibilityJson: jsonb("compatibility_json"),
    requestedPermissionsJson: jsonb("requested_permissions_json"),
    securityReviewStatus: varchar("security_review_status", { length: 16 }),
    createdById: uuid(CREATED_BY_USER_ID_COLUMN)
      .notNull()
      .references(() => users.id),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("marketplace_item_versions_item_version_unique").on(
      t.itemId,
      t.version,
    ),
  ],
);

export const marketplaceInstalls = pgTable(
  "marketplace_installs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid(WORKSPACE_ID_COLUMN)
      .notNull()
      .references(() => workspaces.id, { onDelete: CASCADE_ACTION }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => marketplaceItems.id),
    versionId: uuid("version_id")
      .notNull()
      .references(() => marketplaceItemVersions.id),
    installedByUserId: uuid("installed_by_user_id")
      .notNull()
      .references(() => users.id),
    installedResourceType: varchar("installed_resource_type", {
      length: 32,
    }),
    installedResourceId: uuid("installed_resource_id"),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("marketplace_installs_workspace_item").on(t.workspaceId, t.itemId),
  ],
);

export const marketplaceReviews = pgTable("marketplace_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemId: uuid("item_id")
    .notNull()
    .references(() => marketplaceItems.id, { onDelete: CASCADE_ACTION }),
  versionId: uuid("version_id").references(() => marketplaceItemVersions.id),
  reviewerUserId: uuid("reviewer_user_id")
    .notNull()
    .references(() => users.id),
  status: varchar(STATUS_COLUMN, { length: 24 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const marketplaceRatings = pgTable(
  "marketplace_ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => marketplaceItems.id, { onDelete: CASCADE_ACTION }),
    userId: uuid(USER_ID_COLUMN)
      .notNull()
      .references(() => users.id),
    rating: integer("rating").notNull(),
    review: text("review"),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("marketplace_ratings_item_user_unique").on(t.itemId, t.userId),
  ],
);

export const marketplaceReports = pgTable("marketplace_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemId: uuid("item_id")
    .notNull()
    .references(() => marketplaceItems.id, { onDelete: CASCADE_ACTION }),
  reporterUserId: uuid("reporter_user_id")
    .notNull()
    .references(() => users.id),
  reason: text("reason").notNull(),
  status: varchar(STATUS_COLUMN, { length: 16 }).notNull().default("pending"),
  createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Marketplace Shares ────────────────────────────────────────────────

export const marketplaceItemShares = pgTable(
  "marketplace_item_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => marketplaceItems.id, { onDelete: CASCADE_ACTION }),
    sharedWithUserId: uuid("shared_with_user_id")
      .notNull()
      .references(() => users.id),
    sharedAt: timestamp("shared_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("marketplace_item_shares_item_user_unique").on(
      t.itemId,
      t.sharedWithUserId,
    ),
  ],
);
