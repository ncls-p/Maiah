import { and, eq } from "drizzle-orm";
import { isPlatformAdminSession } from "@/modules/admin/auth";
import { getRequestAuthContext } from "@/modules/auth/request-auth-context";
import type { getSession } from "@/modules/auth/session";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  organizations,
  organizationMembers,
  workspaces,
} from "@/server/infrastructure/db/schema";
import type { AnalyticsKind, AnalyticsQuery, AnalyticsScope } from "./query";

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;
export async function listAnalyticsScopes(
  session: Session,
  kind: AnalyticsKind,
): Promise<AnalyticsScope[]> {
  // Deployment-wide reporting is intentionally restricted to interactive users.
  if (getRequestAuthContext()?.type === "api_key") return [];
  const platform = await isPlatformAdminSession(session);
  const principal = {
    principalType: "user" as const,
    principalId: session.user.id,
  };
  const orgs = platform
    ? await db
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
    : await db
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .innerJoin(
          organizationMembers,
          eq(organizationMembers.organizationId, organizations.id),
        )
        .where(
          and(
            eq(organizationMembers.userId, session.user.id),
            eq(organizationMembers.status, "active"),
          ),
        );
  const projects = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      organizationId: workspaces.organizationId,
    })
    .from(workspaces);
  const permission = kind === "usage" ? "usage.view" : "audit.view";
  const allowed = async (
    type: "organization" | "workspace",
    id: string,
    p = permission,
  ) =>
    platform ||
    (await authorization.checkPermission(principal, p, type, id)).granted;
  const scopes: AnalyticsScope[] = platform
    ? [
        {
          id: "application",
          name: "application",
          type: "application",
          canExport: true,
        },
      ]
    : [];
  for (const org of orgs) {
    if (await allowed("organization", org.id))
      scopes.push({
        ...org,
        type: "organization",
        canExport:
          kind === "usage" ||
          (await allowed("organization", org.id, "audit.export")),
      });
  }
  for (const project of projects) {
    if (await allowed("workspace", project.id))
      scopes.push({
        ...project,
        type: "workspace",
        canExport:
          kind === "usage" ||
          (await allowed("workspace", project.id, "audit.export")),
      });
  }
  return scopes;
}
export async function authorizeAnalytics(
  session: Session,
  kind: AnalyticsKind,
  query: AnalyticsQuery,
) {
  const scopes = await listAnalyticsScopes(session, kind);
  return scopes.find(
    (scope) =>
      scope.type === query.scope &&
      scope.id ===
        (query.scope === "application" ? "application" : query.scopeId),
  );
}
