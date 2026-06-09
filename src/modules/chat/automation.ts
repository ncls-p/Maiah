import { and, eq, isNull } from "drizzle-orm";
import { generateText } from "ai";
import { z } from "zod";

import { decryptValue } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { db } from "@/server/infrastructure/db";
import {
	aiModels,
	aiProviders,
	appSettings,
} from "@/server/infrastructure/db/schema";
import {
	getAdapter,
	type ProviderKind,
	type ProviderRuntimeConfig,
} from "@/server/infrastructure/providers";

const CHAT_AUTOMATION_SETTING_KEY = "chatAutomation";

const chatAutomationConfigSchema = z.object({
	enabled: z.boolean().default(false),
	providerId: z.uuid().optional(),
	modelId: z.uuid().optional(),
	generateTitles: z.boolean().default(true),
	generateSuggestions: z.boolean().default(true),
});

export type ChatAutomationConfig = z.infer<typeof chatAutomationConfigSchema>;

function defaultChatAutomationConfig(): ChatAutomationConfig {
	return {
		enabled: false,
		generateTitles: true,
		generateSuggestions: true,
	};
}

function parseChatAutomationConfig(value: unknown): ChatAutomationConfig {
	const parsed = chatAutomationConfigSchema.safeParse(value);
	return parsed.success ? parsed.data : defaultChatAutomationConfig();
}

export async function getChatAutomationConfig() {
	const [row] = await db
		.select({ valueJson: appSettings.valueJson })
		.from(appSettings)
		.where(eq(appSettings.key, CHAT_AUTOMATION_SETTING_KEY))
		.limit(1);
	return parseChatAutomationConfig(row?.valueJson);
}

export async function setChatAutomationConfig(
	input: ChatAutomationConfig,
	updatedById: string,
) {
	const value = chatAutomationConfigSchema.parse(input);
	await db
		.insert(appSettings)
		.values({
			key: CHAT_AUTOMATION_SETTING_KEY,
			valueJson: value,
			updatedById,
			updatedAt: new Date(),
		})
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { valueJson: value, updatedById, updatedAt: new Date() },
		});
	return getChatAutomationConfig();
}

export async function getChatAutomationAdminState() {
	const [config, providers] = await Promise.all([
		getChatAutomationConfig(),
		db
			.select({
				id: aiProviders.id,
				name: aiProviders.name,
				kind: aiProviders.kind,
				enabled: aiProviders.enabled,
			})
			.from(aiProviders)
			.where(and(eq(aiProviders.enabled, true), isNull(aiProviders.archivedAt)))
			.orderBy(aiProviders.name),
	]);

	const models = await db
		.select({
			id: aiModels.id,
			providerId: aiModels.providerId,
			modelId: aiModels.modelId,
			displayName: aiModels.displayName,
			enabled: aiModels.enabled,
		})
		.from(aiModels)
		.where(eq(aiModels.enabled, true))
		.orderBy(aiModels.displayName, aiModels.modelId);

	return { config, providers, models };
}

type RuntimeModel = {
	runtimeConfig: ProviderRuntimeConfig;
	providerKind: ProviderKind;
	modelId: string;
};

async function resolveRuntimeModel(
	config: ChatAutomationConfig,
): Promise<RuntimeModel | null> {
	if (!config.enabled || !config.providerId || !config.modelId) return null;

	const [provider] = await db
		.select()
		.from(aiProviders)
		.where(
			and(
				eq(aiProviders.id, config.providerId),
				eq(aiProviders.enabled, true),
				isNull(aiProviders.archivedAt),
			),
		)
		.limit(1);
	if (!provider) return null;

	const [model] = await db
		.select()
		.from(aiModels)
		.where(
			and(
				eq(aiModels.id, config.modelId),
				eq(aiModels.providerId, provider.id),
				eq(aiModels.enabled, true),
			),
		)
		.limit(1);
	if (!model) return null;

	let apiKey: string | undefined;
	if (provider.encryptedApiKey) {
		apiKey = await decryptValue(provider.encryptedApiKey);
	}

	let headers: Record<string, string> | undefined;
	if (provider.encryptedHeadersJson) {
		headers = {};
		for (const [key, value] of Object.entries(
			provider.encryptedHeadersJson as Record<string, string>,
		)) {
			headers[key] = await decryptValue(value);
		}
	}

	return {
		providerKind: provider.kind as ProviderKind,
		modelId: model.modelId,
		runtimeConfig: {
			kind: provider.kind as ProviderKind,
			name: provider.name,
			baseUrl: provider.baseUrl || undefined,
			authType: provider.authType,
			apiKey,
			headers,
			queryParams:
				(provider.queryParamsJson as Record<string, string>) || undefined,
		},
	};
}

const chatArtifactsSchema = z.object({
	title: z.string().default(""),
	suggestions: z.array(z.string()).default([]),
});

async function generateArtifactsWithRuntimeModel(input: {
	runtime: RuntimeModel;
	prompt: string;
	maxOutputTokens: number;
}) {
	const adapter = getAdapter(input.runtime.providerKind);
	const { text } = await generateText({
		model: adapter.createChatModel(
			input.runtime.runtimeConfig,
			input.runtime.modelId,
		),
		prompt: input.prompt,
		temperature: 0.2,
		maxOutputTokens: input.maxOutputTokens,
	});
	return parseArtifacts(text);
}

export async function generateChatAutomationArtifacts(input: {
	userMessage: string;
	assistantText: string;
	fallbackTitle: string;
}) {
	const config = await getChatAutomationConfig();
	const shouldGenerateTitle = config.enabled && config.generateTitles;
	const shouldGenerateSuggestions =
		config.enabled && config.generateSuggestions;
	if (!shouldGenerateTitle && !shouldGenerateSuggestions) {
		return { title: input.fallbackTitle, suggestions: [] };
	}

	const runtime = await resolveRuntimeModel(config);
	if (!runtime) return { title: input.fallbackTitle, suggestions: [] };

	try {
		const object = await generateArtifactsWithRuntimeModel({
			runtime,
			maxOutputTokens: 260,
			prompt: [
				"You generate concise chat UI metadata after an assistant response.",
				"Return ONLY valid minified JSON. No markdown, no prose, no code fence.",
				'Required shape: {"title":"...","suggestions":["...","...","..."]}',
				"Title: 3 to 7 words, no quotes, no trailing punctuation, same language as the user's message when obvious.",
				"Suggestions: exactly 3 useful next user messages, each under 80 characters, same language as the conversation, phrased as prompts the user can click.",
				shouldGenerateTitle ? null : "Set title to an empty string.",
				shouldGenerateSuggestions ? null : "Set suggestions to an empty array.",
				`User message:\n${input.userMessage.slice(0, 1_500)}`,
				`Assistant answer:\n${input.assistantText.slice(0, 4_000)}`,
			]
				.filter(Boolean)
				.join("\n\n"),
		});
		const fallback = createFallbackArtifacts(input);
		return {
			title: shouldGenerateTitle
				? sanitizeTitle(object.title, fallback.title)
				: input.fallbackTitle,
			suggestions: shouldGenerateSuggestions
				? ensureThreeSuggestions(object.suggestions, fallback.suggestions)
				: [],
		};
	} catch (error) {
		logger.warn("Failed to generate chat automation artifacts", {
			error: error instanceof Error ? error.message : String(error),
		});
		const fallback = createFallbackArtifacts(input);
		return {
			title: shouldGenerateTitle ? fallback.title : input.fallbackTitle,
			suggestions: shouldGenerateSuggestions ? fallback.suggestions : [],
		};
	}
}

export async function generateConversationTitle(input: {
	userMessage: string;
	fallback: string;
}) {
	const artifacts = await generateChatAutomationArtifacts({
		userMessage: input.userMessage,
		assistantText: "",
		fallbackTitle: input.fallback,
	});
	return artifacts.title;
}

export async function generateNextChatSuggestions(input: {
	userMessage: string;
	assistantText: string;
}) {
	const artifacts = await generateChatAutomationArtifacts({
		userMessage: input.userMessage,
		assistantText: input.assistantText,
		fallbackTitle: "",
	});
	return artifacts.suggestions;
}

function parseArtifacts(value: string) {
	const cleaned = value
		.replace(/^```(?:json|text)?/i, "")
		.replace(/```$/i, "")
		.trim();
	const jsonStart = cleaned.indexOf("{");
	const jsonEnd = cleaned.lastIndexOf("}");
	const json =
		jsonStart >= 0 && jsonEnd > jsonStart
			? cleaned.slice(jsonStart, jsonEnd + 1)
			: cleaned;

	try {
		const parsed = JSON.parse(json) as unknown;
		const result = chatArtifactsSchema.safeParse(parsed);
		if (result.success) return result.data;
	} catch {
		// Fall through to best-effort extraction below.
	}

	return {
		title: extractTitle(cleaned),
		suggestions: extractSuggestions(cleaned),
	};
}

function extractTitle(value: string) {
	const match = /"?title"?\s*[:=]\s*["“”']([^"“”'\n]+)/i.exec(value);
	return match?.[1]?.trim() ?? "";
}

function extractSuggestions(value: string) {
	const parsedLines = value
		.split("\n")
		.map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
		.filter(Boolean)
		.filter((line) => !/^title\s*[:=]/i.test(line))
		.filter((line) => !/^suggestions?\s*[:=]\s*\[?\s*$/i.test(line));
	return parsedLines.slice(0, 3);
}

function sanitizeTitle(value: string, fallback: string) {
	const title = value
		.replace(/^```(?:json|text)?/i, "")
		.replace(/```$/i, "")
		.replace(/^['\"]|['\"]$/g, "")
		.replace(/[.。!?！？]+$/g, "")
		.trim();
	return (title || fallback).slice(0, 100);
}

function createFallbackArtifacts(input: {
	userMessage: string;
	assistantText: string;
	fallbackTitle: string;
}) {
	const french = looksFrench(`${input.userMessage}\n${input.assistantText}`);
	return {
		title:
			buildLocalTitle(input.userMessage) ||
			sanitizeTitle(
				input.fallbackTitle,
				french ? "Nouvelle discussion" : "New chat",
			),
		suggestions: french
			? [
					"Peux-tu détailler les étapes ?",
					"Donne-moi un exemple concret",
					"Quelles sont les alternatives ?",
				]
			: [
					"Can you break that into steps?",
					"Show me a concrete example",
					"What are the alternatives?",
				],
	};
}

function buildLocalTitle(value: string) {
	const words = value
		.replace(/[\r\n]+/g, " ")
		.replace(/[`*_#>\[\]{}()]/g, " ")
		.replace(/[.。!?！？,;:]+$/g, "")
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 7);
	return words.join(" ").slice(0, 100);
}

function looksFrench(value: string) {
	return /[àâçéèêëîïôùûüÿœæ]|\b(le|la|les|un|une|des|du|de|ce|cette|ces|pour|avec|sans|est|sont|peux|peut|comment|quoi|quel|quelle)\b/i.test(
		value,
	);
}

function ensureThreeSuggestions(values: unknown[], fallback: string[]) {
	const suggestions = sanitizeSuggestions(values);
	for (const suggestion of fallback) {
		if (suggestions.length >= 3) break;
		if (!suggestions.includes(suggestion)) suggestions.push(suggestion);
	}
	return suggestions.slice(0, 3);
}

function sanitizeSuggestions(values: unknown[]) {
	return values
		.filter((value): value is string => typeof value === "string")
		.map((value) => value.replace(/^['\"]|['\"]$/g, "").trim())
		.filter(Boolean)
		.map((value) => value.slice(0, 80))
		.slice(0, 3);
}
