export const organizationSettingsSections = [
  "organizations",
  "organization-data",
  "projects",
  "members",
  "branding",
  "navigation",
  "chat",
  "workflows",
  "companion",
] as const;
export const platformSettingsSections = [
  "registration",
  "data",
  "health",
  "impact",
  "rag",
  "assistants",
  "sharing",
  "limits",
] as const;
export type OrganizationSettingsSection =
  (typeof organizationSettingsSections)[number];
export function isOrganizationSettingsSection(
  value: string,
): value is OrganizationSettingsSection {
  return organizationSettingsSections.some((section) => section === value);
}
export function isPlatformSettingsSection(value: string) {
  return platformSettingsSections.some((section) => section === value);
}
