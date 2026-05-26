"use client";

import { useEffect, useState } from "react";
import { ClipboardListIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

interface AuditEvent {
	id: string;
	action: string;
	resourceType: string | null;
	outcome: string;
	actorPrincipalId: string | null;
	createdAt: string;
}
function getBrowserWorkspaceId() {
	return typeof window === "undefined"
		? null
		: window.sessionStorage.getItem("active_workspace_id");
}

export default function AuditPage() {
	const [workspaceId, setWorkspaceId] = useState<string | null>(() =>
		getBrowserWorkspaceId(),
	);
	const [events, setEvents] = useState<AuditEvent[]>([]);
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
				`/api/workspace/audit?workspaceId=${workspaceId}`,
			);
			if (!res.ok) throw new Error("Failed to load audit log");
			if (!cancelled) setEvents(await res.json());
		}
		void run()
			.catch(
				(error) =>
					!cancelled &&
					toast.error(
						error instanceof Error ? error.message : "Failed to load audit log",
					),
			)
			.finally(() => !cancelled && setLoading(false));
		return () => {
			cancelled = true;
		};
	}, [workspaceId]);

	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
			<div className="flex flex-col gap-2">
				<div className="section-kicker">Audit</div>
				<h1 className="text-2xl font-semibold sm:text-3xl">Audit log</h1>
				<p className="max-w-2xl text-sm leading-6 text-muted-foreground">
					Security-sensitive actions are recorded with actor, resource, outcome,
					and timestamp.
				</p>
			</div>
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<ClipboardListIcon className="size-5" />
						Recent events
					</CardTitle>
					<CardDescription>Newest workspace audit events.</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-2">
					{loading ? (
						<Loader2 className="animate-spin" />
					) : (
						events.map((event) => (
							<div
								key={event.id}
								className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm"
							>
								<div className="flex items-center gap-2">
									<Badge
										variant={
											event.outcome === "success" ? "secondary" : "destructive"
										}
									>
										{event.outcome}
									</Badge>
									<span className="font-medium">{event.action}</span>
									<span className="text-muted-foreground">
										{event.resourceType}
									</span>
								</div>
								<span className="text-muted-foreground">
									{new Date(event.createdAt).toLocaleString()}
								</span>
							</div>
						))
					)}
					{!loading && events.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No audit events yet.
						</p>
					) : null}
				</CardContent>
			</Card>
		</div>
	);
}
