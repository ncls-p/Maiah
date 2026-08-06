import { describe,expect,it } from "vitest";

import { ORGANIZATION_THEME_PRESETS,THEME_TOKEN_KEYS,resolveOrganizationTheme,themeCss } from "@/modules/organization/themes";

describe("organization themes", () => {
  it("defines every platform color for light and dark variants", () => {
    for (const preset of Object.values(ORGANIZATION_THEME_PRESETS)) {
      for (const mode of [preset.light, preset.dark]) {
        expect(Object.keys(mode).sort()).toEqual([...THEME_TOKEN_KEYS].sort());
        expect(Object.values(mode).every((color) => /^#[0-9a-f]{6}$/i.test(color))).toBe(true);
      }
    }
  });

  it("uses a custom theme only when both palettes are provided", () => {
    const custom = structuredClone(ORGANIZATION_THEME_PRESETS.forest);
    custom.light.primary = "#123456";
    custom.dark.primary = "#abcdef";

    expect(resolveOrganizationTheme("custom", custom)).toBe(custom);
    expect(resolveOrganizationTheme("custom", null)).toBe(ORGANIZATION_THEME_PRESETS.ocean);
  });

  it("generates selectors for both appearance variants", () => {
    const css = themeCss(ORGANIZATION_THEME_PRESETS.violet);

    expect(css).toContain(":root[data-brand-theme]");
    expect(css).toContain(".dark[data-brand-theme]");
    expect(css).toContain("--sidebar-accent:");
    expect(css).toContain("--chart-5:");
  });
});
