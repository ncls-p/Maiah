import { getSession } from "@/modules/auth/session";
import { organizationThemeDocumentStyle } from "@/modules/organization/themes";
import { getActiveOrganizationThemeForUser } from "@/modules/workspace/use-cases";

export async function resolveDocumentOrganizationTheme() {
  try {
    const session = await getSession();
    const userId = session?.user?.id;
    if (!userId) return null;
    const row = await getActiveOrganizationThemeForUser(userId);
    if (!row) return null;
    return organizationThemeDocumentStyle(row.theme, row.themeConfig);
  } catch {
    return null;
  }
}
