import {
  pgTable,
  text,
  timestamp,
  varchar,
  uuid,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

const CREATED_AT_COLUMN = "created_at";
const WORKSPACE_ID_COLUMN = "workspace_id";

// ─── Audit Events ──────────────────────────────────────────────────────

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id"),
    workspaceId: uuid(WORKSPACE_ID_COLUMN),
    actorPrincipalType: varchar("actor_principal_type", { length: 32 }),
    actorPrincipalId: uuid("actor_principal_id"),
    action: varchar("action", { length: 128 }).notNull(),
    resourceType: varchar("resource_type", { length: 64 }),
    resourceId: uuid("resource_id"),
    outcome: varchar("outcome", { length: 16 }).notNull(),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_events_actor").on(t.actorPrincipalType, t.actorPrincipalId),
    index("audit_events_resource").on(t.resourceType, t.resourceId),
    index("audit_events_workspace").on(t.workspaceId),
  ],
);
