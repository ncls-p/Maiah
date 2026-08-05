import { z } from "zod";

const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#?[0-9a-fA-F]{6}$/, "Use a 6-digit hex color")
  .default("#25adc5");

export const slideDeckInputSchema = z.object({
  title: z.string().trim().min(1).max(140),
  subtitle: z.string().trim().max(220).optional(),
  theme: z.enum(["minimal", "deodis", "midnight", "warm"]).default("deodis"),
  accentColor: hexColorSchema,
  aspectRatio: z.enum(["16:9", "4:3"]).default("16:9"),
  animation: z.enum(["rise", "fade", "none"]).default("rise"),
  height: z.number().int().min(360).max(900).default(560),
  showPrintButton: z.boolean().default(true),
  slides: z
    .array(
      z.object({
        layout: z.enum(["title", "section", "bullets", "two_column", "quote", "closing"]).default("bullets"),
        kicker: z.string().trim().max(80).optional(),
        title: z.string().trim().min(1).max(140),
        body: z.string().trim().max(900).optional(),
        bullets: z.array(z.string().trim().min(1).max(280)).max(8).default([]),
        secondaryTitle: z.string().trim().max(100).optional(),
        secondaryBullets: z.array(z.string().trim().min(1).max(240)).max(6).default([]),
        quote: z.string().trim().max(700).optional(),
        attribution: z.string().trim().max(120).optional(),
        metricValue: z.string().trim().max(80).optional(),
        metricLabel: z.string().trim().max(120).optional(),
        imageUrl: z.url().optional(),
        imageAlt: z.string().trim().max(160).optional(),
        footer: z.string().trim().max(180).optional(),
        notes: z.string().trim().max(1_200).optional(),
      }),
    )
    .min(1)
    .max(30),
});

export type SlideDeckInput = z.infer<typeof slideDeckInputSchema>;

export type DeckSlide = SlideDeckInput["slides"][number];
export type SlideFrame = {
  bullets: string[];
  secondaryBullets: string[];
  footer: string;
  note: string;
};

export const themeClasses: Record<SlideDeckInput["theme"], string> = {
  minimal: "theme-minimal",
  deodis: "theme-deodis",
  midnight: "theme-midnight",
  warm: "theme-warm",
};

export function escapeHtml(value: string | undefined) {
  return (value ?? "").replace(/[&<>'"]/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === "'") return "&#39;";
    return "&quot;";
  });
}

export function escapeJsonForHtml(value: unknown) {
  return JSON.stringify(value, null, 2).replace(/</g, "\\u003c");
}

export function normalizeAccentColor(color: string) {
  const normalized = color.startsWith("#") ? color : `#${color}`;
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : "#25adc5";
}

export function aspectRatioCss(aspectRatio: SlideDeckInput["aspectRatio"]) {
  return aspectRatio === "4:3" ? "4 / 3" : "16 / 9";
}

export function printPageSize(aspectRatio: SlideDeckInput["aspectRatio"]) {
  return aspectRatio === "4:3" ? "10in 7.5in" : "16in 9in";
}

export function renderKicker(value: string | undefined) {
  return value ? `<p class="slide-kicker">${escapeHtml(value)}</p>` : "";
}

export function renderBody(value: string | undefined) {
  return value ? `<p class="slide-body">${escapeHtml(value)}</p>` : "";
}

export function renderBullets(bullets: string[], variant = "") {
  if (bullets.length === 0) return "";
  const className = variant ? `slide-bullets ${variant}` : "slide-bullets";
  return `<ul class="${className}">${bullets.map((bullet, index) => `<li class="fragment" data-fragment="${index}">${escapeHtml(bullet)}</li>`).join("")}</ul>`;
}

export function renderMetric(input: { metricValue?: string; metricLabel?: string }) {
  if (!input.metricValue) return "";
  return `<div class="metric-card fragment" data-fragment="metric">
		<div class="metric-value">${escapeHtml(input.metricValue)}</div>
		${input.metricLabel ? `<div class="metric-label">${escapeHtml(input.metricLabel)}</div>` : ""}
	</div>`;
}

export function renderImage(input: { imageUrl?: string; imageAlt?: string }) {
  if (!input.imageUrl) return "";
  return `<figure class="slide-image fragment" data-fragment="image">
		<img src="${escapeHtml(input.imageUrl)}" alt="${escapeHtml(input.imageAlt ?? "Slide visual")}" />
	</figure>`;
}

export function createSlideFrame(slide: DeckSlide): SlideFrame {
  return {
    bullets: slide.bullets ?? [],
    secondaryBullets: slide.secondaryBullets ?? [],
    footer: slide.footer ? `<p class="slide-footer">${escapeHtml(slide.footer)}</p>` : "",
    note: slide.notes ? `<aside class="speaker-notes">${escapeHtml(slide.notes)}</aside>` : "",
  };
}

export function renderTitleSlide(slide: DeckSlide, frame: SlideFrame) {
  return `<div class="slide-content title-layout">
		${renderKicker(slide.kicker)}
		<h1>${escapeHtml(slide.title)}</h1>
		${renderBody(slide.body)}
		${renderMetric(slide)}
		${frame.footer}
		${frame.note}
	</div>`;
}

export function renderSectionSlide(slide: DeckSlide, frame: SlideFrame, index: number) {
  return `<div class="slide-content section-layout">
		${renderKicker(slide.kicker ?? `Section ${index + 1}`)}
		<h2>${escapeHtml(slide.title)}</h2>
		${renderBody(slide.body)}
		${frame.footer}
		${frame.note}
	</div>`;
}

export function renderQuoteSlide(slide: DeckSlide, frame: SlideFrame) {
  const quote = slide.quote ?? slide.body ?? slide.title;
  return `<div class="slide-content quote-layout">
		${renderKicker(slide.kicker)}
		<blockquote>${escapeHtml(quote)}</blockquote>
		${slide.attribution ? `<p class="quote-attribution">${escapeHtml(slide.attribution)}</p>` : ""}
		${frame.footer}
		${frame.note}
	</div>`;
}
