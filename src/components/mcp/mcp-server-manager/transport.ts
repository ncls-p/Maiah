import type { ElementType } from "react";
import { CloudIcon, NetworkIcon, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";

import type { HealthColor } from "./types";

export const TRANSPORT_ICONS: Record<string, ElementType> = {
	"streamable-http": CloudIcon,
	sse: NetworkIcon,
	stdio: Wrench,
};

export function transportAccent(transport: string) {
	const map: Record<
		string,
		{
			bar: string;
			bg: string;
			text: string;
			ring: string;
			badge: string;
			iconBg: string;
		}
	> = {
		"streamable-http": {
			bar: "bg-blue-500",
			bg: "bg-blue-500/5",
			text: "text-blue-600 dark:text-blue-400",
			ring: "ring-blue-500/20",
			badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
			iconBg: "bg-blue-100 dark:bg-blue-500/15",
		},
		sse: {
			bar: "bg-teal-500",
			bg: "bg-teal-500/5",
			text: "text-teal-600 dark:text-teal-400",
			ring: "ring-teal-500/20",
			badge: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400",
			iconBg: "bg-teal-100 dark:bg-teal-500/15",
		},
		stdio: {
			bar: "bg-amber-500",
			bg: "bg-amber-500/5",
			text: "text-amber-600 dark:text-amber-400",
			ring: "ring-amber-500/20",
			badge:
				"bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
			iconBg: "bg-amber-100 dark:bg-amber-500/15",
		},
	};
	return map[transport] ?? map["streamable-http"];
}

export function getHealthColor(status: string | null): HealthColor {
	if (!status) return "muted";
	const s = status.toLowerCase();
	if (s === "connected" || s === "healthy" || s === "ok") return "success";
	if (s === "degraded" || s === "warning") return "warning";
	if (s === "error" || s === "disconnected" || s === "failed") {
		return "destructive";
	}
	return "muted";
}

export function healthDotClass(color: HealthColor) {
	const map: Record<HealthColor, string> = {
		success: "bg-success",
		warning: "bg-warning",
		destructive: "bg-destructive",
		muted: "bg-muted-foreground",
	};
	return cn("size-2 shrink-0 rounded-full", map[color]);
}

export function transportLabel(transport: string) {
	switch (transport) {
		case "streamable-http":
			return "Streamable HTTP";
		case "sse":
			return "SSE";
		case "stdio":
			return "Stdio";
		default:
			return transport;
	}
}

export function serverEndpointLabel(server: {
	transport: string;
	url: string | null;
	command: string | null;
	argsJson?: string[] | null;
}) {
	return (
		server.url ||
		(server.command
			? [server.command, ...(server.argsJson ?? [])].filter(Boolean).join(" ")
			: server.transport)
	);
}
