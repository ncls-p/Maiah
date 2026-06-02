import type { ElementType } from "react";
import { CloudIcon, CpuIcon, NetworkIcon, PlugIcon } from "lucide-react";

import type { ProviderAuthType, ProviderKind } from "./types";

export const KIND_LABELS: Record<ProviderKind, string> = {
	"openai-compatible": "OpenAI-compatible",
	dragonfly: "Dragonfly",
	"vercel-ai-gateway": "Vercel AI Gateway",
	native: "Native",
};

export const AUTH_TYPE_LABELS: Record<ProviderAuthType, string> = {
	bearer: "Bearer token",
	"x-api-key": "X-API-KEY header",
	"custom-header": "Custom headers only",
	gateway: "Gateway bearer token",
};

export const KIND_ICONS: Record<ProviderKind, ElementType> = {
	"openai-compatible": PlugIcon,
	dragonfly: CloudIcon,
	"vercel-ai-gateway": NetworkIcon,
	native: CpuIcon,
};

export function kindAccent(kind: ProviderKind) {
	const map: Record<
		ProviderKind,
		{
			bar: string;
			bg: string;
			text: string;
			ring: string;
			badge: string;
			iconBg: string;
		}
	> = {
		"openai-compatible": {
			bar: "bg-blue-500",
			bg: "bg-blue-500/5",
			text: "text-blue-600 dark:text-blue-400",
			ring: "ring-blue-500/20",
			badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
			iconBg: "bg-blue-100 dark:bg-blue-500/15",
		},
		dragonfly: {
			bar: "bg-teal-500",
			bg: "bg-teal-500/5",
			text: "text-teal-600 dark:text-teal-400",
			ring: "ring-teal-500/20",
			badge: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400",
			iconBg: "bg-teal-100 dark:bg-teal-500/15",
		},
		"vercel-ai-gateway": {
			bar: "bg-violet-500",
			bg: "bg-violet-500/5",
			text: "text-violet-600 dark:text-violet-400",
			ring: "ring-violet-500/20",
			badge:
				"bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
			iconBg: "bg-violet-100 dark:bg-violet-500/15",
		},
		native: {
			bar: "bg-amber-500",
			bg: "bg-amber-500/5",
			text: "text-amber-600 dark:text-amber-400",
			ring: "ring-amber-500/20",
			badge:
				"bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
			iconBg: "bg-amber-100 dark:bg-amber-500/15",
		},
	};
	return map[kind];
}
