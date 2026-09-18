const TAB_PATHS: Record<string, string> = {
  teams: "/members/teams",
  roles: "/members/roles",
  resources: "/members/resources",
};

const SECTION_REDIRECTS: Record<string, AccessRedirect> = {
  organizations: { pathname: "/admin/settings/organizations" },
  sharing: { pathname: "/admin/settings/sharing" },
  limits: { pathname: "/admin/settings/limits" },
};

export type AccessRedirect = {
  pathname: string;
  query?: Record<string, string>;
};

export function accessLegacyRedirectPath(
  section?: string,
  tab?: string,
): AccessRedirect | null {
  if (section && section !== "access")
    return SECTION_REDIRECTS[section] ?? null;
  if (tab && tab !== "access") {
    const pathname = TAB_PATHS[tab];
    return pathname ? { pathname } : null;
  }
  return null;
}

export function queryParam(
  value: string | string[] | undefined,
): string | undefined {
  return typeof value === "string" ? value : undefined;
}
