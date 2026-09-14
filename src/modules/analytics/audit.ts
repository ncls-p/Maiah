import { desc, eq, sql, getTableColumns } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  auditEvents,
  organizations,
  users,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { analyticsFilters, auditOrganization } from "./filters";
import { getAnalyticsFacets } from "./facets";
import type { AnalyticsQuery } from "./query";

export async function getAuditAnalytics(query: AnalyticsQuery) {
  const where = analyticsFilters(query, "audit");
  const [events, [totals], facets] = await Promise.all([
    db
      .select({
        ...getTableColumns(auditEvents),
        workspaceName: workspaces.name,
        organizationName: organizations.name,
        actorName: users.name,
        actorEmail: users.email,
      })
      .from(auditEvents)
      .leftJoin(workspaces, eq(auditEvents.workspaceId, workspaces.id))
      .leftJoin(organizations, eq(auditOrganization, organizations.id))
      .leftJoin(users, eq(auditEvents.actorPrincipalId, users.id))
      .where(where)
      .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
      .limit(query.limit)
      .offset(query.offset),
    db
      .select({
        total: sql<number>`count(*)::float8`,
        success: sql<number>`count(*) filter (where ${auditEvents.outcome} = 'success')::float8`,
        failed: sql<number>`count(*) filter (where ${auditEvents.outcome} = 'failed')::float8`,
        denied: sql<number>`count(*) filter (where ${auditEvents.outcome} = 'denied')::float8`,
      })
      .from(auditEvents)
      .leftJoin(workspaces, eq(auditEvents.workspaceId, workspaces.id))
      .where(where),
    getAnalyticsFacets(query, "audit"),
  ]);
  return { events, totals, facets, offset: query.offset, limit: query.limit };
}
