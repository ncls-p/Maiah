import {
  boolean,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { organizations } from "./workspace";

export const organizationBuiltinToolPolicies = pgTable(
  "organization_builtin_tool_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    toolName: varchar("tool_name", { length: 255 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    requireApproval: boolean("require_approval").notNull().default(false),
    updatedById: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("organization_builtin_tool_policies_org_tool_unique").on(
      table.organizationId,
      table.toolName,
    ),
  ],
);
