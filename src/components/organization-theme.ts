import {
  organizationThemeDocumentStyle,
  type OrganizationThemeConfig,
} from "@/modules/organization/themes";

export function applyOrganizationTheme(
  themeName: unknown,
  themeConfig?: OrganizationThemeConfig | null,
) {
  const resolved = organizationThemeDocumentStyle(themeName, themeConfig);
  document.documentElement.dataset.brandTheme = resolved.themeName;
  let style = document.querySelector<HTMLStyleElement>(
    "style[data-organization-theme]",
  );
  if (!style) {
    style = document.createElement("style");
    style.dataset.organizationTheme = "true";
    document.head.append(style);
  }
  style.textContent = resolved.css;
}
