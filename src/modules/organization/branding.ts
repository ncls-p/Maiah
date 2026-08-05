import { and,eq } from "drizzle-orm";

import type {
OrganizationTheme,
OrganizationThemeConfig,
} from "@/modules/organization/themes";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { organizations,workspaces } from "@/server/infrastructure/db/schema";
export {
ORGANIZATION_THEMES,
type OrganizationTheme,
type OrganizationThemeConfig
} from "@/modules/organization/themes";

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
  const principal = {
    principalType: "user" as const,
    principalId: input.userId,
  };
  const [readPermission, managePermission] = await Promise.all([
    authorization.checkPermission(
      principal,
      "organization.get",
      "organization",
      organization.id,
    ),
    authorization.checkPermission(
      principal,
      "organization.update",
      "organization",
      organization.id,
    ),
  ]);
  if (!readPermission.granted) return null;
  return {
    organizationId: organization.id,
    organizationName: organization.name,
    logoUrl: organization.logoUrl,
    theme: organization.theme as OrganizationTheme,
    themeConfig: organization.themeConfigJson,
    canManage: managePermission.granted,
  };
}

export async function updateOrganizationBranding(input: {
  workspaceId: string;
  userId: string;
  logoUrl: string | null;
  theme: OrganizationTheme;
  themeConfig: OrganizationThemeConfig | null;
}) {
  const current = await getOrganizationBranding(input);
  if (!current) return { status: "not_found" as const };
  if (!current.canManage) return { status: "forbidden" as const };
  const [organization] = await db
    .update(organizations)
    .set({
      logoUrl: input.logoUrl,
      theme: input.theme,
      themeConfigJson: input.themeConfig,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, current.organizationId))
    .returning();
  return { status: "updated" as const, organization };
}
