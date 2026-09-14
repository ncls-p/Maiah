import { and, eq, isNull, or } from "drizzle-orm";

import type { OrganizationThemeConfig } from "@/modules/organization/themes";
import { db } from "@/server/infrastructure/db";
import {
  organizationMembers,
  organizations,
  workspaceMembers,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { getActiveWorkspaceIdForUser } from "./use-cases.active-workspace";

export type ActiveOrganizationTheme = {
  theme: string;
  themeConfig: OrganizationThemeConfig | null;
};

function toActiveOrganizationTheme(row: {
  theme: string;
  themeConfigJson: OrganizationThemeConfig | null;
}): ActiveOrganizationTheme {
  return {
    theme: row.theme,
    themeConfig: row.themeConfigJson,
  };
}

async function organizationThemeForWorkspace(workspaceId: string) {
  const [row] = await db
    .select({
      theme: organizations.theme,
      themeConfigJson: organizations.themeConfigJson,
    })
    .from(workspaces)
    .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
    .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.archivedAt)))
    .limit(1);

  return row ? toActiveOrganizationTheme(row) : null;
}

async function organizationThemeForUserMembership(userId: string) {
  const [row] = await db
    .select({
      theme: organizations.theme,
      themeConfigJson: organizations.themeConfigJson,
    })
    .from(workspaces)
    .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
    .leftJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, workspaces.id),
        eq(workspaceMembers.userId, userId),
      ),
    )
    .leftJoin(
      organizationMembers,
      and(
        eq(organizationMembers.organizationId, organizations.id),
        eq(organizationMembers.userId, userId),
      ),
    )
    .where(
      and(
        isNull(workspaces.archivedAt),
        or(
          eq(workspaceMembers.status, "active"),
          eq(organizationMembers.status, "active"),
        ),
      ),
    )
    .limit(1);

  return row ? toActiveOrganizationTheme(row) : null;
}

export async function getActiveOrganizationThemeForUser(userId: string) {
  const activeWorkspaceId = await getActiveWorkspaceIdForUser(userId);
  if (activeWorkspaceId) {
    const active = await organizationThemeForWorkspace(activeWorkspaceId);
    if (active) return active;
  }
  const projectTheme = await organizationThemeForUserMembership(userId);
  if (projectTheme) return projectTheme;
  // An organization may be customized before its first project exists.
  const [organization] = await db
    .select({
      theme: organizations.theme,
      themeConfigJson: organizations.themeConfigJson,
    })
    .from(organizations)
    .innerJoin(
      organizationMembers,
      eq(organizationMembers.organizationId, organizations.id),
    )
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.status, "active"),
      ),
    )
    .orderBy(organizations.createdAt, organizations.id)
    .limit(1);
  return organization ? toActiveOrganizationTheme(organization) : null;
}
