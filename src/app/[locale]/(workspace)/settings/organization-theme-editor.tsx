"use client";

import { useTranslations } from "next-intl";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ORGANIZATION_THEME_PRESETS,THEME_TOKEN_KEYS,type OrganizationTheme,type OrganizationThemeConfig,type ThemePalette,type ThemeToken } from "@/modules/organization/themes";

const PRESET_NAMES = ["ocean", "forest", "ember", "violet", "slate"] as const;

function copyTheme(theme: OrganizationThemeConfig): OrganizationThemeConfig {
  return { light: { ...theme.light }, dark: { ...theme.dark } };
}

function palettePreview(palette: ThemePalette) {
  return [palette.background, palette.primary, palette.accent];
}

function ThemeChoice(props: { name: OrganizationTheme; colors: string[]; selected: boolean; disabled: boolean; label: string; onSelect: () => void }) {
  return (
    <button type="button" disabled={props.disabled} onClick={props.onSelect} aria-pressed={props.selected} className={cn("rounded-xl border p-3 text-left transition-[border-color,box-shadow,transform] hover:-translate-y-px", props.selected ? "border-primary ring-2 ring-primary/15" : "border-border", props.disabled && "cursor-not-allowed opacity-60")}>
      <span className="mb-2 flex h-8 overflow-hidden rounded-lg border">
        {props.colors.map((color, index) => (
          <i key={`${color}-${index}`} className="flex-1" style={{ backgroundColor: color }} />
        ))}
      </span>
      <span className="text-sm font-medium">{props.label}</span>
    </button>
  );
}

function tokenLabel(token: ThemeToken) {
  return token.replaceAll("-", " ");
}

function PaletteFields(props: { mode: "light" | "dark"; palette: ThemePalette; disabled: boolean; onChange: (palette: ThemePalette) => void }) {
  const t = useTranslations("settings.branding");
  return (
    <details className="rounded-xl border bg-muted/10" open={props.mode === "light"}>
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{t(props.mode)}</summary>
      <div className="grid gap-3 border-t p-4 sm:grid-cols-2 xl:grid-cols-3">
        {THEME_TOKEN_KEYS.map((token) => (
          <Label key={token} className="gap-1.5 capitalize">
            {tokenLabel(token)}
            <span className="flex items-center gap-2 rounded-lg border bg-background px-2 py-1.5">
              <input
                type="color"
                value={props.palette[token]}
                disabled={props.disabled}
                aria-label={`${props.mode} ${tokenLabel(token)}`}
                className="size-7 cursor-pointer border-0 bg-transparent p-0"
                onChange={(event) =>
                  props.onChange({
                    ...props.palette,
                    [token]: event.target.value,
                  })
                }
              />
              <span className="font-mono text-xs text-muted-foreground">{props.palette[token]}</span>
            </span>
          </Label>
        ))}
      </div>
    </details>
  );
}

export function OrganizationThemeEditor(props: { theme: OrganizationTheme; themeConfig: OrganizationThemeConfig | null; disabled: boolean; onThemeChange: (theme: OrganizationTheme) => void; onThemeConfigChange: (theme: OrganizationThemeConfig) => void }) {
  const t = useTranslations("settings.branding");
  const customTheme = props.themeConfig ?? copyTheme(ORGANIZATION_THEME_PRESETS.ocean);

  function selectCustom() {
    if (!props.themeConfig) props.onThemeConfigChange(customTheme);
    props.onThemeChange("custom");
  }

  return (
    <div>
      <Label>{t("theme")}</Label>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {PRESET_NAMES.map((name) => (
          <ThemeChoice key={name} name={name} colors={palettePreview(ORGANIZATION_THEME_PRESETS[name].light)} selected={props.theme === name} disabled={props.disabled} label={t(`themes.${name}`)} onSelect={() => props.onThemeChange(name)} />
        ))}
        <ThemeChoice name="custom" colors={palettePreview(customTheme.light)} selected={props.theme === "custom"} disabled={props.disabled} label={t("themes.custom")} onSelect={selectCustom} />
      </div>
      {props.theme === "custom" ? (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">{t("customHint")}</p>
          {(["light", "dark"] as const).map((mode) => (
            <PaletteFields key={mode} mode={mode} palette={customTheme[mode]} disabled={props.disabled} onChange={(palette) => props.onThemeConfigChange({ ...customTheme, [mode]: palette })} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
