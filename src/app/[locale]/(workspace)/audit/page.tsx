"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { PageLoading } from "@/components/page-loading";
import { RequireWorkspaceAccess } from "@/components/require-workspace-access";
import { WorkspacePage } from "@/components/workspace-page";
import { useWorkspace } from "@/hooks/use-workspace";

import {
	AuditDashboard,
	AuditDashboardSkeleton,
	type AuditEvent,
} from "./audit-dashboard";

function AuditPageContent() {
	const t = useTranslations("admin");
	const tCommon = useTranslations("common");
	const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
	const [events, setEvents] = useState<AuditEvent[] | null>(null);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [actionFilter, setActionFilter] = useState("");
	const [outcomeFilter, setOutcomeFilter] = useState("all");
	const [fromDate, setFromDate] = useState("");
	const [toDate, setToDate] = useState("");

	const loadEvents = useCallback(
		async (options?: {
			silent?: boolean;
			action?: string;
			outcome?: string;
			from?: string;
			to?: string;
		}) => {
			if (!workspaceId) return;
			if (options?.silent) {
				setRefreshing(true);
			} else {
				setLoading(true);
			}
			try {
				const action = options?.action ?? actionFilter;
				const outcome = options?.outcome ?? outcomeFilter;
				const from = options?.from ?? fromDate;
				const to = options?.to ?? toDate;
				const params = new URLSearchParams({ workspaceId, limit: "100" });
				if (action.trim()) params.set("action", action.trim());
				if (outcome !== "all") params.set("outcome", outcome);
				if (from) params.set("from", new Date(from).toISOString());
				if (to) params.set("to", new Date(`${to}T23:59:59`).toISOString());
				const res = await fetch(`/api/workspace/audit?${params.toString()}`);
				if (!res.ok) throw new Error("Failed to load audit log");
				setEvents(await res.json());
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Failed to load audit log",
				);
			} finally {
				setLoading(false);
				setRefreshing(false);
			}
		},
		[actionFilter, fromDate, outcomeFilter, toDate, workspaceId],
	);

	function exportCsv() {
		if (!events || events.length === 0) return;
		const header = ["createdAt", "action", "resourceType", "outcome", "actor"];
		const rows = events.map((event) =>
			[
				event.createdAt,
				event.action,
				event.resourceType ?? "",
				event.outcome,
				event.actorName ?? event.actorEmail ?? event.actorPrincipalId ?? "",
			]
				.map((value) => `"${String(value).replace(/"/g, '""')}"`)
				.join(","),
		);
		const blob = new Blob([[header.join(","), ...rows].join("\n")], {
			type: "text/csv;charset=utf-8;",
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `audit-${workspaceId?.slice(0, 8) ?? "export"}.csv`;
		link.click();
		URL.revokeObjectURL(url);
	}

	useEffect(() => {
		if (!workspaceId) return;
		const timeout = window.setTimeout(() => {
			void loadEvents();
		}, 0);
		return () => window.clearTimeout(timeout);
	}, [loadEvents, workspaceId]);

	if (workspaceLoading || !workspaceId) {
		return <PageLoading label={tCommon("loading")} />;
	}

	return (
		<WorkspacePage
			title={t("auditTitle")}
			description={t("auditDescription")}
			width="wide"
		>
			{loading && !events ? (
				<AuditDashboardSkeleton />
			) : events ? (
				<AuditDashboard
					events={events}
					busy={refreshing}
					actionFilter={actionFilter}
					outcomeFilter={outcomeFilter}
					fromDate={fromDate}
					toDate={toDate}
					onActionChange={setActionFilter}
					onOutcomeChange={setOutcomeFilter}
					onFromChange={setFromDate}
					onToChange={setToDate}
					onApply={() => void loadEvents({ silent: true })}
					onReset={() => {
						setActionFilter("");
						setOutcomeFilter("all");
						setFromDate("");
						setToDate("");
						void loadEvents({
							silent: true,
							action: "",
							outcome: "all",
							from: "",
							to: "",
						});
					}}
					onExport={exportCsv}
				/>
			) : (
				<AuditDashboardSkeleton />
			)}
		</WorkspacePage>
	);
}

export default function AuditPage() {
	return (
		<RequireWorkspaceAccess required="canViewAudit">
			<AuditPageContent />
		</RequireWorkspaceAccess>
	);
}
