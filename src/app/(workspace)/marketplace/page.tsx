"use client";

import { useCallback, useEffect, useState } from "react";
import {
	DownloadIcon,
	Loader2,
	PackagePlusIcon,
	StoreIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface MarketplaceItem {
	id: string;
	name: string;
	description: string | null;
	status: string;
	pricingModel: string;
	installCount: number;
	verifiedPublisher: boolean;
}
interface Agent {
	id: string;
	name: string;
}
function getBrowserWorkspaceId() {
	return typeof window === "undefined"
		? null
		: window.sessionStorage.getItem("active_workspace_id");
}

export default function MarketplacePage() {
	const [workspaceId, setWorkspaceId] = useState<string | null>(() =>
		getBrowserWorkspaceId(),
	);
	const [items, setItems] = useState<MarketplaceItem[]>([]);
	const [agents, setAgents] = useState<Agent[]>([]);
	const [loading, setLoading] = useState(true);
	const [draft, setDraft] = useState({
		agentId: "",
		version: "1.0.0",
		name: "",
	});

	useEffect(() => {
		if (workspaceId) return;
		let cancelled = false;
		async function run() {
			const res = await fetch("/api/workspaces");
			const data = await res.json();
			if (cancelled || !Array.isArray(data)) return;
			const id = data[0]?.workspace?.id || data[0]?.id;
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

	const load = useCallback(async () => {
		const [itemRes, agentRes] = await Promise.all([
			fetch("/api/marketplace/items"),
			workspaceId
				? fetch(`/api/workspace/agents?workspaceId=${workspaceId}`)
				: Promise.resolve(null),
		]);
		if (!itemRes.ok) throw new Error("Failed to load marketplace");
		setItems(await itemRes.json());
		if (agentRes && agentRes.ok) {
			const agentData = await agentRes.json();
			setAgents(Array.isArray(agentData) ? agentData : agentData.agents);
		}
	}, [workspaceId]);

	useEffect(() => {
		let cancelled = false;
		async function run() {
			try {
				await load();
			} catch (error) {
				if (!cancelled)
					toast.error(
						error instanceof Error
							? error.message
							: "Failed to load marketplace",
					);
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		void run();
		return () => {
			cancelled = true;
		};
	}, [load]);

	async function install(itemId: string) {
		if (!workspaceId) return;
		const res = await fetch(`/api/marketplace/items/${itemId}/install`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ workspaceId }),
		});
		if (res.ok) toast.success("Installed as a local workspace agent");
		else
			toast.error(
				(await res.json().catch(() => null))?.error || "Install failed",
			);
	}

	async function createDraft() {
		if (!workspaceId || !draft.agentId) return;
		const res = await fetch("/api/marketplace/items", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				workspaceId,
				agentId: draft.agentId,
				version: draft.version,
				name: draft.name || undefined,
			}),
		});
		if (!res.ok)
			return toast.error(
				(await res.json().catch(() => null))?.error || "Draft failed",
			);
		setDraft({ agentId: "", version: "1.0.0", name: "" });
		toast.success("Marketplace draft created");
		await load();
	}

	return (
		<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
			<div className="flex flex-col gap-2">
				<div className="section-kicker">Marketplace</div>
				<h1 className="text-2xl font-semibold sm:text-3xl">Marketplace</h1>
				<p className="max-w-2xl text-sm leading-6 text-muted-foreground">
					Publish, review, and install agent packages without mutating local
					copies after install.
				</p>
			</div>
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<PackagePlusIcon className="size-5" />
						Publish agent draft
					</CardTitle>
					<CardDescription>
						Create a reviewable marketplace manifest from an existing agent
						version.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 sm:grid-cols-[1fr_10rem_1fr_auto] sm:items-end">
					<div className="grid gap-2">
						<Label>Agent</Label>
						<select
							className="h-10 rounded-md border bg-background px-3 text-sm"
							value={draft.agentId}
							onChange={(e) => setDraft({ ...draft, agentId: e.target.value })}
						>
							<option value="">Select agent</option>
							{agents.map((agent) => (
								<option key={agent.id} value={agent.id}>
									{agent.name}
								</option>
							))}
						</select>
					</div>
					<div className="grid gap-2">
						<Label>Version</Label>
						<Input
							value={draft.version}
							onChange={(e) => setDraft({ ...draft, version: e.target.value })}
						/>
					</div>
					<div className="grid gap-2">
						<Label>Name override</Label>
						<Input
							value={draft.name}
							onChange={(e) => setDraft({ ...draft, name: e.target.value })}
						/>
					</div>
					<Button onClick={createDraft} disabled={!draft.agentId}>
						<StoreIcon data-icon="inline-start" />
						Draft
					</Button>
				</CardContent>
			</Card>
			{loading ? (
				<div className="flex justify-center py-12">
					<Loader2 className="animate-spin" />
				</div>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{items.map((item) => (
						<Card key={item.id}>
							<CardHeader>
								<div className="flex items-start justify-between gap-3">
									<div>
										<CardTitle>{item.name}</CardTitle>
										<CardDescription>
											{item.description || "No description"}
										</CardDescription>
									</div>
									{item.verifiedPublisher ? <Badge>Verified</Badge> : null}
								</div>
							</CardHeader>
							<CardContent className="flex items-center justify-between">
								<div className="flex gap-2">
									<Badge variant="outline">{item.pricingModel}</Badge>
									<Badge variant="secondary">
										{item.installCount} installs
									</Badge>
								</div>
								<Button size="sm" onClick={() => install(item.id)}>
									<DownloadIcon data-icon="inline-start" />
									Install
								</Button>
							</CardContent>
						</Card>
					))}
					{items.length === 0 ? (
						<Card>
							<CardContent className="p-8 text-center text-sm text-muted-foreground">
								No published marketplace items.
							</CardContent>
						</Card>
					) : null}
				</div>
			)}
		</div>
	);
}
