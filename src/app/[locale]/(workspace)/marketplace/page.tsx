"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
	BookMarked,
	BookOpen,
	Bot,
	Download,
	ExternalLink,
	Package,
	PackagePlus,
	Plug,
	Puzzle,
	Search,
	Settings,
	Share2,
	Star,
	Store,
	Trash2,
	Wrench,
	Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { PageEmptyState } from "@/components/page-empty-state";
import { PageLoading } from "@/components/page-loading";
import { WorkspacePage } from "@/components/workspace-page";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspaceShell } from "@/components/app-shell";
import {
	ResourceShareDialog,
	type ShareableResource,
} from "@/components/marketplace/resource-share-dialog";
import { useWorkspace } from "@/hooks/use-workspace";

// ─── Types ─────────────────────────────────────────────────────────────

interface MarketplaceItem {
	id: string;
	name: string;
	description: string | null;
	type: string;
	status: string;
	visibility: string;
	installCount: number;
	totalDownloads: number;
	isFeatured: boolean;
	featuredOrder?: number | null;
	ratingAverage?: string | null;
	verifiedPublisher: boolean;
	publishedAt: string | null;
	createdAt: string;
	tagsJson: string[] | null;
	publisherUserId: string;
	shareCount?: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────

const itemIconMap: Record<
	string,
	React.ComponentType<{ className?: string }>
> = {
	agent: Bot,
	skill: Package,
	custom_tool: Wrench,
	prompt_template: BookOpen,
	tool_pack: Puzzle,
	mcp_preset: Plug,
	workflow_template: Workflow,
	knowledge_template: BookMarked,
	provider_preset: Settings,
};

function ItemIcon({ type, className }: { type: string; className?: string }) {
	const Icon = itemIconMap[type] ?? Package;
	return <Icon className={className} />;
}

function getItemLabel(type: string) {
	switch (type) {
		case "agent":
			return "Agent";
		case "skill":
			return "Skill";
		case "custom_tool":
			return "Tool";
		case "prompt_template":
			return "Prompt";
		case "tool_pack":
			return "Tool Pack";
		case "mcp_preset":
			return "MCP Preset";
		case "workflow_template":
			return "Workflow";
		case "knowledge_template":
			return "Knowledge";
		case "provider_preset":
			return "Provider";
		default:
			return type;
	}
}

function formatDate(dateStr: string | null) {
	if (!dateStr) return "—";
	return new Date(dateStr).toLocaleDateString("fr-FR", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

type MarketplaceFilters = {
	search: string;
	typeFilter: string;
	sortBy: string;
	featuredOnly: boolean;
};

function filterAndSortMarketplaceItems(
	items: MarketplaceItem[],
	filters: MarketplaceFilters,
): MarketplaceItem[] {
	let result = items;

	if (filters.featuredOnly) {
		result = result.filter((item) => item.isFeatured);
	}

	if (filters.typeFilter !== "all") {
		result = result.filter((item) => item.type === filters.typeFilter);
	}

	if (filters.search.trim()) {
		const q = filters.search.trim().toLowerCase();
		result = result.filter(
			(item) =>
				item.name.toLowerCase().includes(q) ||
				(item.description?.toLowerCase().includes(q) ?? false) ||
				(item.tagsJson?.some((tag) => tag.toLowerCase().includes(q)) ?? false),
		);
	}

	return [...result].sort((a, b) => {
		switch (filters.sortBy) {
			case "newest":
				return (
					new Date(b.publishedAt ?? b.createdAt).getTime() -
					new Date(a.publishedAt ?? a.createdAt).getTime()
				);
			case "downloads":
				return b.totalDownloads - a.totalDownloads;
			case "rating":
				return (b.ratingAverage ?? "").localeCompare(a.ratingAverage ?? "");
			case "featured":
			default: {
				if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
				const orderDiff = (b.featuredOrder ?? 0) - (a.featuredOrder ?? 0);
				if (orderDiff !== 0) return orderDiff;
				return b.totalDownloads - a.totalDownloads;
			}
		}
	});
}

// ─── Components ────────────────────────────────────────────────────────

function MarketplaceItemCard({
	item,
	isOwner,
	onInstall,
	onShare,
	onDelete,
	onFeature,
	onUnfeature,
	isAdmin,
}: {
	item: MarketplaceItem;
	isOwner: boolean;
	isAdmin: boolean;
	onInstall: (id: string) => void;
	onShare: (item: MarketplaceItem) => void;
	onDelete: (id: string) => void;
	onFeature: (id: string) => void;
	onUnfeature: (id: string) => void;
}) {
	return (
		<Card
			className={
				item.isFeatured ? "ring-1 ring-yellow-500/30 bg-yellow-500/[0.03]" : undefined
			}
		>
			<CardHeader className="pb-2">
				<div className="flex items-start gap-2">
					<div className="flex items-center justify-center w-9 h-9 shrink-0 rounded-lg bg-muted">
						<ItemIcon
							type={item.type}
							className="h-5 w-5 text-muted-foreground"
						/>
					</div>
					<div className="min-w-0 flex-1 space-y-1">
						<div className="flex flex-wrap items-center gap-1.5">
							<CardTitle className="text-base leading-snug">{item.name}</CardTitle>
							{item.isFeatured ? (
								<Badge
									variant="default"
									className="shrink-0 bg-yellow-500 text-black text-[10px] uppercase tracking-wide"
								>
									<Star className="h-3 w-3 mr-0.5 fill-current" />
									Featured
								</Badge>
							) : null}
						</div>
						<CardDescription className="flex items-center gap-2">
							<Badge variant="secondary" className="text-xs">
								{getItemLabel(item.type)}
							</Badge>
						</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-3">
				{item.description && (
					<p className="text-sm text-muted-foreground line-clamp-2">
						{item.description}
					</p>
				)}
				{item.tagsJson && item.tagsJson.length > 0 && (
					<div className="flex flex-wrap gap-1">
						{item.tagsJson.map((tag) => (
							<Badge key={tag} variant="outline" className="text-xs">
								{tag}
							</Badge>
						))}
					</div>
				)}
				<div className="flex items-center justify-between text-xs text-muted-foreground">
					<div className="flex items-center gap-3">
						<span className="flex items-center gap-1">
							<Download className="h-3 w-3" /> {item.totalDownloads}
						</span>
						<span>{formatDate(item.publishedAt)}</span>
					</div>
					<div className="flex items-center gap-1">
						{isOwner && (
							<>
								<Button
									size="icon"
									variant="ghost"
									className="h-6 w-6"
									onClick={() => onShare(item)}
								>
									<Share2 className="h-3 w-3" />
								</Button>
								<Button
									size="icon"
									variant="ghost"
									className="h-6 w-6 text-destructive"
									onClick={() => onDelete(item.id)}
								>
									<Trash2 className="h-3 w-3" />
								</Button>
							</>
						)}
						{isAdmin && (
							<Button
								size="icon"
								variant="ghost"
								className="h-6 w-6"
								onClick={() =>
									item.isFeatured ? onUnfeature(item.id) : onFeature(item.id)
								}
							>
								<Star
									className={`h-3 w-3 ${item.isFeatured ? "fill-yellow-400 text-yellow-400" : ""}`}
								/>
							</Button>
						)}
					</div>
				</div>
				<div className="flex gap-2">
					<Button
						size="sm"
						className="flex-1"
						onClick={() => onInstall(item.id)}
					>
						<PackagePlus className="h-3 w-3 mr-1" />
						Installer
					</Button>
					<Button size="sm" variant="outline" asChild>
						<a href={`/marketplace/items/${item.id}`}>
							<ExternalLink className="h-3 w-3 mr-1" />
							Détails
						</a>
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

// ─── Main Page ─────────────────────────────────────────────────────────

export default function MarketplacePage() {
	const router = useRouter();
	const { workspaceId } = useWorkspace();
	const { currentUserId, isAdmin = false } = useWorkspaceShell();
	const [loading, setLoading] = useState(true);
	const [publishedItems, setPublishedItems] = useState<MarketplaceItem[]>([]);
	const [draftItems, setDraftItems] = useState<MarketplaceItem[]>([]);
	const [sharedItems, setSharedItems] = useState<MarketplaceItem[]>([]);

	// Filters
	const [search, setSearch] = useState("");
	const [typeFilter, setTypeFilter] = useState<string>("all");
	const [sortBy, setSortBy] = useState<string>("featured");
	const [featuredOnly, setFeaturedOnly] = useState(false);

	// Share dialog
	const [shareResource, setShareResource] = useState<ShareableResource | null>(
		null,
	);

	const fetchMarketplaceData = useCallback(async (): Promise<{
		published: MarketplaceItem[];
		drafts: MarketplaceItem[];
		shared: MarketplaceItem[];
	}> => {
		const [publishedRes, draftsRes, sharedRes] = await Promise.all([
			fetch("/api/marketplace/items"),
			fetch("/api/marketplace/items?includeDrafts=true"),
			fetch("/api/marketplace/items?_path=shared-with-me"),
		]);

		if (!publishedRes.ok) throw new Error("Failed to load marketplace");

		const published = (await publishedRes.json()) as MarketplaceItem[];
		const allDrafts = (await draftsRes.json()) as MarketplaceItem[];
		const sharedData = await sharedRes.json();
		const shared = Array.isArray(sharedData)
			? sharedData.map((s: { item: MarketplaceItem }) => s.item)
			: [];
		return {
			published,
			drafts: allDrafts.filter((item) => item.status === "draft"),
			shared,
		};
	}, []);

	useEffect(() => {
		let cancelled = false;
		fetchMarketplaceData()
			.then((data) => {
				if (!cancelled) {
					setPublishedItems(data.published);
					setDraftItems(data.drafts);
					setSharedItems(data.shared);
				}
			})
			.catch((error) => {
				if (!cancelled)
					toast.error(
						error instanceof Error
							? error.message
							: "Failed to load marketplace",
					);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [fetchMarketplaceData]);

	const filters = useMemo<MarketplaceFilters>(
		() => ({ search, typeFilter, sortBy, featuredOnly }),
		[search, typeFilter, sortBy, featuredOnly],
	);

	const myItems = useMemo(
		() =>
			draftItems.filter((item) => item.publisherUserId === currentUserId),
		[draftItems, currentUserId],
	);

	const filteredPublished = useMemo(
		() => filterAndSortMarketplaceItems(publishedItems, filters),
		[publishedItems, filters],
	);

	const filteredMyItems = useMemo(
		() => filterAndSortMarketplaceItems(myItems, filters),
		[myItems, filters],
	);

	const filteredShared = useMemo(
		() => filterAndSortMarketplaceItems(sharedItems, filters),
		[sharedItems, filters],
	);

	const handleInstall = useCallback(
		async (itemId: string) => {
			if (!workspaceId) return;
			const res = await fetch(`/api/marketplace/items/${itemId}/install`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workspaceId }),
			});
			if (res.ok) {
				toast.success("Installé avec succès");
				const payload = await res.json();
				if (payload.agent?.id) {
					router.push(`/agents/${payload.agent.id}`);
				} else if (payload.skill?.id) {
					router.push("/tools?tab=skills");
				} else if (payload.custom_tool?.id) {
					router.push("/custom-tools");
				} else if (payload.mcp_preset?.id) {
					router.push("/tools?tab=mcp");
				}
			} else {
				toast.error(
					(await res.json().catch(() => ({}))).error || "Installation échouée",
				);
			}
		},
		[workspaceId, router],
	);

	const reload = useCallback(() => {
		fetchMarketplaceData()
			.then((data) => {
				setPublishedItems(data.published);
				setDraftItems(data.drafts);
				setSharedItems(data.shared);
			})
			.catch((error) => {
				toast.error(error instanceof Error ? error.message : "Reload failed");
			});
	}, [fetchMarketplaceData]);

	const handleDelete = useCallback(
		async (itemId: string) => {
			if (!confirm("Supprimer cet item ?")) return;
			const res = await fetch(`/api/marketplace/items/${itemId}`, {
				method: "DELETE",
			});
			if (res.ok) {
				toast.success("Item supprimé");
				reload();
			} else {
				toast.error("Suppression échouée");
			}
		},
		[reload],
	);

	const handleFeature = useCallback(
		async (itemId: string) => {
			const res = await fetch(`/api/marketplace/items/${itemId}/feature`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});
			if (res.ok) {
				toast.success("Item mis en avant");
				reload();
			} else {
				toast.error("Échec");
			}
		},
		[reload],
	);

	const handleUnfeature = useCallback(
		async (itemId: string) => {
			const res = await fetch(`/api/marketplace/items/${itemId}/feature`, {
				method: "DELETE",
			});
			if (res.ok) {
				toast.success("Item retiré des favoris");
				reload();
			} else {
				toast.error("Échec");
			}
		},
		[reload],
	);

	const openShareDialog = useCallback((item: MarketplaceItem) => {
		setShareResource({
			kind: "marketplace_item",
			id: item.id,
			name: item.name,
			publisherUserId: item.publisherUserId,
		});
	}, []);

	if (loading) return <PageLoading />;

	return (
		<WorkspacePage title="Marketplace">
			{/* Search & Filters */}
			<div className="flex flex-col sm:flex-row gap-3 mb-6">
				<div className="relative flex-1">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Rechercher dans la marketplace..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-9"
					/>
				</div>
				<Select value={typeFilter} onValueChange={setTypeFilter}>
					<SelectTrigger className="w-full sm:w-40" aria-label="Filtrer par type">
						<SelectValue placeholder="Type" />
					</SelectTrigger>
					<SelectContent position="popper" className="z-[100]">
						<SelectItem value="all">Tous les types</SelectItem>
						<SelectItem value="agent">Agents</SelectItem>
						<SelectItem value="skill">Skills</SelectItem>
						<SelectItem value="custom_tool">Tools</SelectItem>
						<SelectItem value="prompt_template">Prompts</SelectItem>
						<SelectItem value="tool_pack">Tool Packs</SelectItem>
						<SelectItem value="mcp_preset">MCP</SelectItem>
						<SelectItem value="workflow_template">Workflows</SelectItem>
						<SelectItem value="knowledge_template">Knowledge</SelectItem>
						<SelectItem value="provider_preset">Providers</SelectItem>
					</SelectContent>
				</Select>
				<Select value={sortBy} onValueChange={setSortBy}>
					<SelectTrigger className="w-full sm:w-40" aria-label="Trier les items">
						<SelectValue placeholder="Trier par" />
					</SelectTrigger>
					<SelectContent position="popper" className="z-[100]">
						<SelectItem value="featured">Mis en avant</SelectItem>
						<SelectItem value="newest">Plus récent</SelectItem>
						<SelectItem value="downloads">Téléchargements</SelectItem>
						<SelectItem value="rating">Notes</SelectItem>
					</SelectContent>
				</Select>
				<Button
					type="button"
					variant={featuredOnly ? "default" : "outline"}
					aria-pressed={featuredOnly}
					onClick={() => setFeaturedOnly((current) => !current)}
				>
					<Star
						className={`h-4 w-4 mr-1 ${featuredOnly ? "fill-current" : ""}`}
					/>
					Featured
				</Button>
			</div>

			{/* Tabs */}
			<Tabs defaultValue="all">
				<TabsList>
					<TabsTrigger value="all">Tous ({filteredPublished.length})</TabsTrigger>
					<TabsTrigger value="my-items">
						Mes items ({filteredMyItems.length})
					</TabsTrigger>
					<TabsTrigger value="shared">
						Partagés ({filteredShared.length})
					</TabsTrigger>
				</TabsList>

				{/* All Items */}
				<TabsContent value="all" className="mt-4">
					{filteredPublished.length === 0 ? (
						<PageEmptyState
							icon={Store}
							title="Aucun item trouvé"
							description="Ajustez vos filtres ou publiez votre premier item"
						/>
					) : (
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							{filteredPublished.map((item) => (
								<MarketplaceItemCard
									key={item.id}
									item={item}
									isOwner={item.publisherUserId === currentUserId}
									isAdmin={isAdmin}
									onInstall={handleInstall}
									onShare={openShareDialog}
									onDelete={handleDelete}
									onFeature={handleFeature}
									onUnfeature={handleUnfeature}
								/>
							))}
						</div>
					)}
				</TabsContent>

				{/* My Items */}
				<TabsContent value="my-items" className="mt-4">
					{filteredMyItems.length === 0 ? (
						<PageEmptyState
							icon={PackagePlus}
							title="Aucun brouillon"
							description="Créez un brouillon depuis la page d'un agent"
						/>
					) : (
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							{filteredMyItems.map((item) => (
								<MarketplaceItemCard
									key={item.id}
									item={item}
									isOwner={true}
									isAdmin={isAdmin}
									onInstall={handleInstall}
									onShare={openShareDialog}
									onDelete={handleDelete}
									onFeature={handleFeature}
									onUnfeature={handleUnfeature}
								/>
							))}
						</div>
					)}
				</TabsContent>

				{/* Shared with me */}
				<TabsContent value="shared" className="mt-4">
					{filteredShared.length === 0 ? (
						<PageEmptyState
							icon={Share2}
							title="Aucun item partagé"
							description="Quand quelqu&apos;un vous partage un item, il apparaîtra ici"
						/>
					) : (
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							{filteredShared.map((item) => (
								<MarketplaceItemCard
									key={item.id}
									item={item}
									isOwner={item.publisherUserId === currentUserId}
									isAdmin={isAdmin}
									onInstall={handleInstall}
									onShare={openShareDialog}
									onDelete={handleDelete}
									onFeature={handleFeature}
									onUnfeature={handleUnfeature}
								/>
							))}
						</div>
					)}
				</TabsContent>
			</Tabs>

			{/* Share Dialog */}
			<ResourceShareDialog
				resource={shareResource}
				workspaceId={workspaceId}
				open={shareResource !== null}
				onClose={() => setShareResource(null)}
				onSuccess={reload}
			/>
		</WorkspacePage>
	);
}
