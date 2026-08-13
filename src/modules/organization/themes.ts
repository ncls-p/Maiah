export const ORGANIZATION_THEMES = [
  "ocean",
  "forest",
  "ember",
  "violet",
  "slate",
  "custom",
] as const;

export type OrganizationTheme = (typeof ORGANIZATION_THEMES)[number];

export const THEME_TOKEN_KEYS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "success",
  "warning",
  "info",
  "border",
  "input",
  "ring",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
] as const;

export type ThemeToken = (typeof THEME_TOKEN_KEYS)[number];
export type ThemePalette = Record<ThemeToken, string>;
export type OrganizationThemeConfig = {
  light: ThemePalette;
  dark: ThemePalette;
};

type PaletteSeed = {
  background: string;
  foreground: string;
  surface: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  destructive: string;
  success: string;
  warning: string;
  info: string;
  border: string;
  input: string;
};

function palette(seed: PaletteSeed): ThemePalette {
  return {
    background: seed.background,
    foreground: seed.foreground,
    card: seed.surface,
    "card-foreground": seed.foreground,
    popover: seed.surface,
    "popover-foreground": seed.foreground,
    primary: seed.primary,
    "primary-foreground": seed.primaryForeground,
    secondary: seed.secondary,
    "secondary-foreground": seed.foreground,
    muted: seed.muted,
    "muted-foreground": seed.mutedForeground,
    accent: seed.accent,
    "accent-foreground": seed.foreground,
    destructive: seed.destructive,
    "destructive-foreground": seed.primaryForeground,
    success: seed.success,
    warning: seed.warning,
    info: seed.info,
    border: seed.border,
    input: seed.input,
    ring: seed.primary,
    "chart-1": seed.primary,
    "chart-2": seed.success,
    "chart-3": seed.info,
    "chart-4": seed.warning,
    "chart-5": seed.destructive,
    sidebar: seed.secondary,
    "sidebar-foreground": seed.foreground,
    "sidebar-primary": seed.primary,
    "sidebar-primary-foreground": seed.primaryForeground,
    "sidebar-accent": seed.accent,
    "sidebar-accent-foreground": seed.foreground,
    "sidebar-border": seed.border,
    "sidebar-ring": seed.primary,
  };
}

const lightBase = {
  foreground: "#17222d",
  primaryForeground: "#ffffff",
  destructive: "#c73f3f",
  success: "#27825b",
  warning: "#9a6a14",
  info: "#3275a8",
};
const darkBase = {
  foreground: "#edf2f5",
  primaryForeground: "#10202a",
  destructive: "#ed6a5e",
  success: "#67c795",
  warning: "#e9bc62",
  info: "#79b7e4",
};

function theme(light: PaletteSeed, dark: PaletteSeed): OrganizationThemeConfig {
  return { light: palette(light), dark: palette(dark) };
}

export const ORGANIZATION_THEME_PRESETS: Record<
  Exclude<OrganizationTheme, "custom">,
  OrganizationThemeConfig
> = {
  ocean: theme(
    {
      ...lightBase,
      background: "#f5fafb",
      surface: "#ffffff",
      primary: "#0f7f94",
      secondary: "#eaf4f6",
      muted: "#edf3f4",
      mutedForeground: "#5d6873",
      accent: "#e3f5f8",
      border: "#d7e2e5",
      input: "#c9d8dc",
    },
    {
      ...darkBase,
      background: "#111c22",
      surface: "#17252c",
      primary: "#68c9d9",
      secondary: "#1d2d35",
      muted: "#23343d",
      mutedForeground: "#a7b5bc",
      accent: "#21414a",
      border: "#34464f",
      input: "#43555e",
    },
  ),
  forest: theme(
    {
      ...lightBase,
      background: "#f5faf6",
      surface: "#ffffff",
      primary: "#28765a",
      secondary: "#eaf4ed",
      muted: "#edf3ef",
      mutedForeground: "#596b60",
      accent: "#e4f4e9",
      border: "#d3e2d7",
      input: "#c4d6ca",
    },
    {
      ...darkBase,
      background: "#111c17",
      surface: "#17261e",
      primary: "#70c99a",
      secondary: "#1d3026",
      muted: "#24392d",
      mutedForeground: "#a7b9ae",
      accent: "#214536",
      border: "#344b3d",
      input: "#435b4d",
    },
  ),
  ember: theme(
    {
      ...lightBase,
      background: "#fff8f3",
      surface: "#fffdfb",
      primary: "#bd4b20",
      secondary: "#f8ece5",
      muted: "#f5eee9",
      mutedForeground: "#725f55",
      accent: "#ffeadb",
      border: "#ead7cc",
      input: "#dec8bb",
    },
    {
      ...darkBase,
      background: "#211713",
      surface: "#2a1d18",
      primary: "#ef9a62",
      secondary: "#35251e",
      muted: "#3d2b23",
      mutedForeground: "#c2afa4",
      accent: "#4b2d20",
      border: "#594036",
      input: "#6a4e42",
    },
  ),
  violet: theme(
    {
      ...lightBase,
      background: "#faf7fc",
      surface: "#ffffff",
      primary: "#6945a4",
      secondary: "#f1ebf6",
      muted: "#f2eef5",
      mutedForeground: "#695f70",
      accent: "#f0e6f8",
      border: "#e1d6e8",
      input: "#d5c7de",
    },
    {
      ...darkBase,
      background: "#19151f",
      surface: "#211b29",
      primary: "#b99ae4",
      secondary: "#2b2335",
      muted: "#33293e",
      mutedForeground: "#b7aabe",
      accent: "#3d2a4d",
      border: "#4a3a57",
      input: "#594769",
    },
  ),
  slate: theme(
    {
      ...lightBase,
      background: "#f7f9fb",
      surface: "#ffffff",
      primary: "#435366",
      secondary: "#edf1f4",
      muted: "#eef1f3",
      mutedForeground: "#65717c",
      accent: "#e7edf1",
      border: "#d8e0e6",
      input: "#cad4dc",
    },
    {
      ...darkBase,
      background: "#14191f",
      surface: "#1b222a",
      primary: "#a8b8c8",
      secondary: "#242d36",
      muted: "#2a343e",
      mutedForeground: "#aab4bd",
      accent: "#303d49",
      border: "#3c4854",
      input: "#4a5865",
    },
  ),
};

const ORGANIZATION_THEME_SET = new Set<string>(ORGANIZATION_THEMES);

export function parseOrganizationTheme(
  value: unknown,
): OrganizationTheme | null {
  return typeof value === "string" && ORGANIZATION_THEME_SET.has(value)
    ? (value as OrganizationTheme)
    : null;
}

export function resolveOrganizationTheme(
  themeName: OrganizationTheme,
  customTheme: OrganizationThemeConfig | null | undefined,
) {
  return themeName === "custom" && customTheme
    ? customTheme
    : ORGANIZATION_THEME_PRESETS[themeName === "custom" ? "ocean" : themeName];
}

export function organizationThemeDocumentStyle(
  themeName: unknown,
  themeConfig?: OrganizationThemeConfig | null,
) {
  const theme = parseOrganizationTheme(themeName) ?? "ocean";
  return {
    themeName: theme,
    css: themeCss(resolveOrganizationTheme(theme, themeConfig)),
  };
}

export function themeCss(config: OrganizationThemeConfig) {
  const declarations = (colors: ThemePalette) =>
    THEME_TOKEN_KEYS.map((key) => `--${key}:${colors[key]}`).join(";");
  return `:root[data-brand-theme]{${declarations(config.light)}}.dark[data-brand-theme]{${declarations(config.dark)}}`;
}
