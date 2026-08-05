import { and, eq } from "drizzle-orm";

import { db } from "@/server/infrastructure/db";
import { organizations, workspaces } from "@/server/infrastructure/db/schema";
import { authorization } from "@/server/domain/services/authorization";

export const ORGANIZATION_THEMES = [
  "ocean",
  "forest",
  "ember",
  "violet",
  "slate",
] as const;

export type OrganizationTheme = (typeof ORGANIZATION_THEMES)[number];

async function organizationForWorkspace(workspaceId: string) {
  const [row] = await db
    .select({ organization: organizations })
    .from(workspaces)
    .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
    .where(and(eq(workspaces.id, workspaceId)))
    .limit(1);
  return row?.organization ?? null;
}

export async function getOrganizationBranding(input: {
  workspaceId: string;
  userId: string;
}) {
  const organization = await organizationForWorkspace(input.workspaceId);
  if (!organization) return null;
  const permission = await authorization.checkPermission(
    { principalType: "user", principalId: input.userId },
    "organization.update",
    "organization",
    organization.id,
  );
  return {
    organizationId: organization.id,
    organizationName: organization.name,
    logoUrl: organization.logoUrl,
    theme: organization.theme as OrganizationTheme,
    canManage: permission.granted,
  };
}

export async function updateOrganizationBranding(input: {
  workspaceId: string;
  userId: string;
  logoUrl: string | null;
  theme: OrganizationTheme;
}) {
  const current = await getOrganizationBranding(input);
  if (!current) return { status: "not_found" as const };
  if (!current.canManage) return { status: "forbidden" as const };
  const [organization] = await db
    .update(organizations)
    .set({ logoUrl: input.logoUrl, theme: input.theme, updatedAt: new Date() })
    .where(eq(organizations.id, current.organizationId))
    .returning();
  return { status: "updated" as const, organization };
}
