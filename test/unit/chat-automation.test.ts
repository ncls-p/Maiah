import { describe, expect, it } from "vitest";

import {
	createFallbackArtifacts,
	ensureThreeSuggestions,
	parseArtifacts,
	parseArtifactsFromModelOutput,
	validateChatAutomationConfigShape,
} from "@/modules/chat/automation";

describe("validateChatAutomationConfigShape", () => {
	it("requires provider and model when automation is enabled", () => {
		expect(
			validateChatAutomationConfigShape({
				enabled: true,
				generateTitles: true,
				generateSuggestions: true,
			}),
		).toEqual([
			{
				code: "provider_required",
				message: "A provider is required when automation is enabled.",
			},
			{
				code: "model_required",
				message: "A model is required when automation is enabled.",
			},
		]);
	});

	it("allows disabled automation without provider or model", () => {
		expect(
			validateChatAutomationConfigShape({
				enabled: false,
				generateTitles: true,
				generateSuggestions: true,
			}),
		).toEqual([]);
	});

	it("accepts a complete enabled configuration", () => {
		expect(
			validateChatAutomationConfigShape({
				enabled: true,
				providerId: "11111111-1111-4111-8111-111111111111",
				modelId: "22222222-2222-4222-8222-222222222222",
				generateTitles: true,
				generateSuggestions: true,
			}),
		).toEqual([]);
	});
});

describe("parseArtifactsFromModelOutput", () => {
	it("parses strict JSON from reasoning when text is empty", () => {
		expect(
			parseArtifactsFromModelOutput({
				text: "",
				reasoning: [
					{
						type: "reasoning",
						text: 'Planning...\n{"title":"Salut","suggestions":["Aide","Exemple","Suite"]}',
					},
				],
			}),
		).toEqual({
			title: "Salut",
			suggestions: ["Aide", "Exemple", "Suite"],
		});
	});

	it("ignores reasoning prose without a JSON object", () => {
		expect(
			parseArtifactsFromModelOutput({
				text: "",
				reasoning: [
					{
						type: "reasoning",
						text: "Input: user greeting\nConstraint: JSON only",
					},
				],
			}),
		).toEqual({
			title: "",
			suggestions: [],
		});
	});
});

describe("parseArtifacts", () => {
	it("parses valid JSON artifacts", () => {
		expect(
			parseArtifacts(
				'{"title":"Budget review","suggestions":["A","B","C"]}',
			),
		).toEqual({
			title: "Budget review",
			suggestions: ["A", "B", "C"],
		});
	});

	it("extracts artifacts from fenced JSON", () => {
		expect(
			parseArtifacts(
				'```json\n{"title":"Roadmap","suggestions":["Next","Later","Maybe"]}\n```',
			),
		).toEqual({
			title: "Roadmap",
			suggestions: ["Next", "Later", "Maybe"],
		});
	});
});

describe("ensureThreeSuggestions", () => {
	it("pads suggestions with fallback values", () => {
		expect(ensureThreeSuggestions(["Only one"], ["Fallback A", "Fallback B"])).toEqual(
			["Only one", "Fallback A", "Fallback B"],
		);
	});
});

describe("createFallbackArtifacts", () => {
	it("returns local French suggestions for French input", () => {
		const artifacts = createFallbackArtifacts({
			userMessage: "Peux-tu m'aider avec ce document ?",
			assistantText: "Voici un résumé du document.",
			fallbackTitle: "New Chat",
		});

		expect(artifacts.title).toContain("Peux-tu");
		expect(artifacts.suggestions).toHaveLength(3);
		expect(artifacts.suggestions[0]).toContain("étapes");
	});

	it("returns local English suggestions for English input", () => {
		const artifacts = createFallbackArtifacts({
			userMessage: "Can you summarize this report?",
			assistantText: "Here is a short summary.",
			fallbackTitle: "New Chat",
		});

		expect(artifacts.title).toContain("Can you");
		expect(artifacts.suggestions).toEqual([
			"Can you break that into steps?",
			"Show me a concrete example",
			"What are the alternatives?",
		]);
	});
});
