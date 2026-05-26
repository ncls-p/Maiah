"use client";

import { useEffect, useState } from "react";
import { BarChart3Icon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

interface UsageEvent {
	id: string;
	operation: string;
	inputTokens: number | null;
	outputTokens: number | null;
	status: string | null;
	latencyMs: number | null;
	createdAt: string;
}
interface UsageResponse {
	totals: { inputTokens: number; outputTokens: number; events: number };
	events: UsageEvent[];
}
function getBrowserWorkspaceId() {
	return typeof window === "undefined"
		? null
		: window.sessionStorage.getItem("active_workspace_id");
}

export default function UsagePage() {
	const [workspaceId, setWorkspaceId] = useState<string | null>(() =>
		getBrowserWorkspaceId(),
	);
	const [data, setData] = useState<UsageResponse | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		if (workspaceId) return;
		let cancelled = false;
		async function run() {
			const res = await fetch("/api/workspaces");
			const rows = await res.json();
			if (cancelled || !Array.isArray(rows)) return;
			const id = rows[0]?.workspace?.id || rows[0]?.id;
			if (id) {
				setWorkspaceId(id);
				window.sessionStorage.setItem("active_workspace_id", id);
			}
		}
		void run().catch(() => toast.error("Unable to load workspace"));
		return () => {
			cancelled = true;
		};
	}, [workspaceId]);

	useEffect(() => {
		if (!workspaceId) return;
		let cancelled = false;
		async function run() {
			const res = await fetch(
				`/api/workspace/usage?workspaceId=${workspaceId}`,
			);
			if (!res.ok) throw new Error("Failed to load usage");
			if (!cancelled) setData(await res.json());
		}
		void run()
			.catch(
				(error) =>
					!cancelled &&
					toast.error(
						error instanceof Error ? error.message : "Failed to load usage",
					),
			)
			.finally(() => !cancelled && setLoading(false));
		return () => {
			cancelled = true;
		};
	}, [workspaceId]);

	return (
		<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
			<div className="flex flex-col gap-2">
				<div className="section-kicker">Usage</div>
				<h1 className="text-2xl font-semibold sm:text-3xl">Usage and quotas</h1>
				<p className="max-w-2xl text-sm leading-6 text-muted-foreground">
					Billing-ready usage events for chat, tools, embeddings, ingestion, and
					MCP calls.
				</p>
			</div>
			{loading ? (
				<div className="flex justify-center py-12">
					<Loader2 className="animate-spin" />
				</div>
			) : (
				<>
					<div className="grid gap-4 sm:grid-cols-3">
						<Card>
							<CardHeader>
								<CardTitle>Events</CardTitle>
							</CardHeader>
							<CardContent className="text-3xl font-semibold">
								{data?.totals.events ?? 0}
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle>Input tokens</CardTitle>
							</CardHeader>
							<CardContent className="text-3xl font-semibold">
								{data?.totals.inputTokens ?? 0}
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle>Output tokens</CardTitle>
							</CardHeader>
							<CardContent className="text-3xl font-semibold">
								{data?.totals.outputTokens ?? 0}
							</CardContent>
						</Card>
					</div>
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<BarChart3Icon className="size-5" />
								Recent usage
							</CardTitle>
							<CardDescription>
								Newest usage records in this workspace.
							</CardDescription>
						</CardHeader>
						<CardContent className="grid gap-2">
							{data?.events.map((event) => (
								<div
									key={event.id}
									className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm"
								>
									<div className="flex items-center gap-2">
										<Badge variant="outline">{event.operation}</Badge>
										<span>{new Date(event.createdAt).toLocaleString()}</span>
									</div>
									<span className="text-muted-foreground">
										{event.inputTokens ?? 0} in / {event.outputTokens ?? 0} out
										· {event.latencyMs ?? 0}ms
									</span>
								</div>
							))}
							{data?.events.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									No usage recorded yet.
								</p>
							) : null}
						</CardContent>
					</Card>
				</>
			)}
		</div>
	);
}
