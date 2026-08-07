export const ORGANIZATION_HERO_LOCALES = ["en", "fr"] as const;

export type OrganizationHeroLocale = (typeof ORGANIZATION_HERO_LOCALES)[number];

export type OrganizationHeroCopy = {
  kicker: string;
  lineOne: string;
  lineTwoPrefix: string;
  accent: string;
  lineTwoSuffix: string;
};

export type OrganizationHeroConfig = Record<
  OrganizationHeroLocale,
  OrganizationHeroCopy
>;

export const DEFAULT_ORGANIZATION_HERO: OrganizationHeroConfig = {
  en: {
    kicker: "YOUR ASSISTED CREATION SPACE",
    lineOne: "Set the direction.",
    lineTwoPrefix: "Maiah",
    accent: "orchestrates",
    lineTwoSuffix: "the rest.",
  },
  fr: {
    kicker: "VOTRE ESPACE DE CRÉATION ASSISTÉE",
    lineOne: "Donnez une direction.",
    lineTwoPrefix: "Maiah",
    accent: "orchestre",
    lineTwoSuffix: "le reste.",
  },
};

export function copyOrganizationHero(
  config: OrganizationHeroConfig = DEFAULT_ORGANIZATION_HERO,
): OrganizationHeroConfig {
  return {
    en: { ...config.en },
    fr: { ...config.fr },
  };
}
