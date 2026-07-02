import { describe, expect, it } from "vitest";
import {
	createSlideDeckArtifact,
	slideDeckInputSchema,
} from "@/modules/tool/slide-deck-tool";

describe("slide deck tool", () => {
	it("renders every slide layout with controls, CSS themes, JS navigation, and escaped JSON", () => {
		const deck = slideDeckInputSchema.parse({
			title: "Quarterly <Review>",
			subtitle: "Growth",
			theme: "midnight",
			accentColor: "ff6600",
			aspectRatio: "4:3",
			animation: "fade",
			showPrintButton: true,
			slides: [
				{
					layout: "title",
					kicker: "Q1",
					title: "Welcome",
					body: "Overview",
					metricValue: "42%",
					metricLabel: "Growth",
					footer: "Confidential",
					notes: "Open strong",
				},
				{ layout: "section", title: "Section", body: "Context" },
				{
					layout: "bullets",
					title: "Plan",
					body: "What changed",
					bullets: ["One", "Two"],
					imageUrl: "https://example.test/image.png",
					imageAlt: "Chart",
				},
				{
					layout: "two_column",
					title: "Compare",
					body: "Left",
					bullets: ["A"],
					secondaryTitle: "Right",
					secondaryBullets: ["B"],
					metricValue: "9",
					metricLabel: "Score",
				},
				{
					layout: "quote",
					title: "Quote title",
					quote: "Ship it",
					attribution: "Team",
				},
				{
					layout: "closing",
					title: "Thanks",
					body: "Questions",
					bullets: ["Next"],
					footer: "End",
				},
			],
		});

		const artifact = createSlideDeckArtifact(deck);

		expect(artifact.kind).toBe("html_artifact");
		expect(artifact.title).toBe("Quarterly <Review>");
		expect(artifact.html).toContain("theme-midnight");
		expect(artifact.html).toContain('data-animation="fade"');
		expect(artifact.html).toContain("Quarterly &lt;Review&gt;");
		expect(artifact.html).toContain('data-action="print"');
		expect(artifact.html).toContain("layout-two_column");
		expect(artifact.html).toContain("quote-attribution");
		expect(artifact.html).toContain("speaker-notes");
		expect(artifact.html).toContain("https://example.test/image.png");
		expect(artifact.css).toContain("--deck-accent: #ff6600");
		expect(artifact.css).toContain("@page { size: 10in 7.5in");
		expect(artifact.js).toContain("function next()");
		expect(artifact.deck.slides).toHaveLength(6);
		expect(artifact.exportNotes).toContain("PDF");
	});

	it("applies defaults and hides print controls when requested", () => {
		const deck = slideDeckInputSchema.parse({
			title: "Minimal",
			showPrintButton: false,
			slides: [{ title: "Only slide" }],
		});

		const artifact = createSlideDeckArtifact(deck);

		expect(deck.theme).toBe("deodis");
		expect(deck.accentColor).toBe("#25adc5");
		expect(deck.animation).toBe("rise");
		expect(deck.slides[0].layout).toBe("bullets");
		expect(artifact.html).not.toContain('data-action="print"');
		expect(artifact.css).toContain("@page { size: 16in 9in");
	});
});
