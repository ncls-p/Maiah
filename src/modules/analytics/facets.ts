import { usageBillingWorkspace } from "@/modules/usage/billing-scope";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  aiModels,
  aiProviders,
  auditEvents,
  organizations,
  teamMembers,
  teams,
  usageEvents,
  users,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { analyticsFilters, auditOrganization } from "./filters";
import type { AnalyticsKind, AnalyticsQuery } from "./query";
import type { Facets } from "./types";

export async function getAnalyticsFacets(
  query: AnalyticsQuery,
  kind: AnalyticsKind,
): Promise<Facets> {
  const event = kind === "usage" ? usageEvents : auditEvents;
  const workspace = sql<string>`${kind === "usage" ? usageBillingWorkspace : auditEvents.workspaceId}`;
  const actor =
    kind === "usage" ? usageEvents.userId : auditEvents.actorPrincipalId;
  const org = kind === "usage" ? workspaces.organizationId : auditOrganization;
  const where = analyticsFilters(query, kind, true);
  const base = () =>
    db
      .selectDistinct({
        id: users.id,
        name: sql<string>`concat_ws(' · ', ${users.name}, ${users.email})`,
      })
      .from(event)
      .leftJoin(workspaces, eq(workspaces.id, workspace));
  const [people, projects, orgs, teamRows] = await Promise.all([
    base().innerJoin(users, eq(actor, users.id)).where(where),
    db
      .selectDistinct({ id: workspaces.id, name: workspaces.name })
      .from(event)
      .innerJoin(workspaces, eq(workspaces.id, workspace))
      .where(where),
    db
      .selectDistinct({ id: organizations.id, name: organizations.name })
      .from(event)
      .leftJoin(workspaces, eq(workspaces.id, workspace))
      .innerJoin(organizations, eq(organizations.id, org))
      .where(where),
    db
      .selectDistinct({ id: teams.id, name: teams.name })
      .from(event)
      .leftJoin(workspaces, eq(workspaces.id, workspace))
      .innerJoin(teamMembers, eq(actor, teamMembers.userId))
      .innerJoin(
        teams,
        sql`${teams.id} = ${teamMembers.teamId} and ${teams.organizationId} = ${org}`,
      )
      .where(where),
  ]);
  const facets: Facets = {
    userIds: people,
    workspaceIds: projects,
    organizationIds: orgs,
    teamIds: teamRows,
  };
  if (kind === "usage") {
    const [providers, models, assistants] = await Promise.all([
      db
        .selectDistinct({ id: aiProviders.id, name: aiProviders.name })
        .from(usageEvents)
        .leftJoin(workspaces, eq(workspaces.id, usageBillingWorkspace))
        .innerJoin(aiProviders, eq(usageEvents.providerId, aiProviders.id))
        .where(where),
      db
        .selectDistinct({
          id: aiModels.id,
          name: sql<string>`coalesce(${aiModels.displayName}, ${aiModels.modelId}) || ' · ' || coalesce(${aiProviders.name}, '')`,
        })
        .from(usageEvents)
        .leftJoin(workspaces, eq(workspaces.id, usageBillingWorkspace))
        .innerJoin(aiModels, eq(usageEvents.modelId, aiModels.id))
        .leftJoin(aiProviders, eq(usageEvents.providerId, aiProviders.id))
        .where(where),
      db
        .selectDistinct({ id: agents.id, name: agents.name })
        .from(usageEvents)
        .leftJoin(workspaces, eq(workspaces.id, usageBillingWorkspace))
        .innerJoin(agents, eq(usageEvents.agentId, agents.id))
        .where(where),
    ]);
    Object.assign(facets, {
      providerIds: providers,
      modelIds: models,
      agentIds: assistants,
    });
  }
  const scalarFields =
    kind === "usage"
      ? ([
          ["operation", usageEvents.operation],
          ["status", usageEvents.status],
        ] as const)
      : ([
          ["action", auditEvents.action],
          ["resourceType", auditEvents.resourceType],
        ] as const);
  await Promise.all(
    scalarFields.map(async ([key, column]) => {
      const rows = await db
        .selectDistinct({ id: column })
        .from(event)
        .leftJoin(workspaces, eq(workspaces.id, workspace))
        .where(where);
      facets[key] = rows.flatMap((row) =>
        row.id ? [{ id: row.id, name: row.id }] : [],
      );
    }),
  );
  for (const rows of Object.values(facets))
    rows.sort((a, b) => a.name.localeCompare(b.name));
  return facets;
}
