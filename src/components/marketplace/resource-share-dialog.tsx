"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Globe, Share2, Star, User, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type ShareStep = "choose" | "user";

export type ShareableResource =
	| {
			kind: "agent";
			id: string;
			name: string;
			description: string | null;
	  }
	| {
			kind: "skill";
			id: string;
			name: string;
			description: string | null;
	  }
	| {
			kind: "custom_tool";
			id: string;
			name: string;
			description: string | null;
	  }
	| {
			kind: "mcp_server";
			id: string;
			name: string;
			description: string | null;
	  }
	| {
			kind: "mcp_tool";
			id: string;
			name: string;
			description: string | null;
	  }
	| {
			kind: "marketplace_item";
			id: string;
			name: string;
			publisherUserId: string;
	  };

interface PlatformUser {
	id: string;
	name: string;
	email: string;
}

function resourceSubject(kind: ShareableResource["kind"]) {
	switch (kind) {
		case "agent":
			return "cet agent";
		case "skill":
			return "ce skill";
		case "custom_tool":
			return "ce tool";
		case "mcp_server":
			return "ce serveur MCP";
		case "mcp_tool":
			return "cet outil MCP";
		case "marketplace_item":
			return "cet item";
	}
}

function ShareOptionCard({
	icon: Icon,
	title,
	description,
	onClick,
	disabled,
	loading,
}: {
	icon: React.ComponentType<{ className?: string }>;
	title: string;
	description: string;
	onClick: () => void;
	disabled?: boolean;
	loading?: boolean;
}) {
	return (
		<button
			type="button"
			disabled={disabled || loading}
			onClick={onClick}
			className={cn(
				"flex w-full items-start gap-3 rounded-xl border border-border/80 p-4 text-left transition-colors",
				"hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				(disabled || loading) && "opacity-60 cursor-not-allowed",
			)}
		>
			<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
				{loading ? (
					<Spinner className="size-4" />
				) : (
					<Icon className="size-5 text-muted-foreground" />
				)}
			</div>
			<div className="min-w-0">
				<p className="font-medium text-sm">{title}</p>
				<p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
			</div>
		</button>
	);
}

export function ResourceShareDialog({
	resource,
	workspaceId,
	open,
	onClose,
	onSuccess,
}: {
	resource: ShareableResource | null;
	workspaceId: string | null;
	open: boolean;
	onClose: () => void;
	onSuccess?: () => void;
}) {
	const [step, setStep] = useState<ShareStep>("choose");
	const [users, setUsers] = useState<PlatformUser[]>([]);
	const [search, setSearch] = useState("");
	const [selectedUserId, setSelectedUserId] = useState("");
	const [busy, setBusy] = useState(false);
	const [marketplaceLoading, setMarketplaceLoading] = useState(false);

	useEffect(() => {
		if (open) {
			setStep("choose");
			setSearch("");
			setSelectedUserId("");
			setBusy(false);
			setMarketplaceLoading(false);
		}
	}, [open]);

	const publisherUserId =
		resource?.kind === "marketplace_item" ? resource.publisherUserId : null;

	const filteredUsers = useMemo(
		() =>
			users.filter(
				(u) =>
					u.id !== publisherUserId &&
					(u.name.toLowerCase().includes(search.toLowerCase()) ||
						u.email.toLowerCase().includes(search.toLowerCase())),
			),
		[users, search, publisherUserId],
	);

	const ensureMarketplaceItemId = useCallback(async () => {
		if (!resource) throw new Error("Ressource manquante");
		if (resource.kind === "marketplace_item") return resource.id;
		if (!workspaceId) throw new Error("Workspace manquant");

		const body: Record<string, unknown> = {
			workspaceId,
			version: "1.0.0",
			name: resource.name,
			description: resource.description || undefined,
			draftOnly: true,
		};

		if (resource.kind === "agent") body.agentId = resource.id;
		if (resource.kind === "skill") body.skillId = resource.id;
		if (resource.kind === "custom_tool") body.customToolId = resource.id;
		if (resource.kind === "mcp_server") body.mcpServerId = resource.id;
		if (resource.kind === "mcp_tool") body.mcpToolId = resource.id;

		const res = await fetch("/api/marketplace/items", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});

		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(err.error || "Impossible de préparer le partage");
		}

		const data = await res.json();
		if (!data.item?.id) throw new Error("Réponse marketplace invalide");
		return data.item.id as string;
	}, [resource, workspaceId]);

	const loadUsers = useCallback(async () => {
		if (users.length > 0) return;
		const res = await fetch("/api/admin/users");
		if (!res.ok) throw new Error("Impossible de charger les utilisateurs");
		const data = await res.json();
		setUsers(Array.isArray(data) ? data : (data.users ?? []));
	}, [users.length]);

	const finish = useCallback(() => {
		onSuccess?.();
		onClose();
	}, [onClose, onSuccess]);

	const handlePublishToMarketplace = useCallback(async () => {
		if (!resource) return;
		setMarketplaceLoading(true);
		try {
			const itemId = await ensureMarketplaceItemId();
			const publishRes = await fetch(
				`/api/marketplace/items/${itemId}/publish`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ visibility: "public" }),
				},
			);
			if (!publishRes.ok) {
				const err = await publishRes.json().catch(() => ({}));
				throw new Error(err.error || "Publication échouée");
			}
			toast.success(`"${resource.name}" est sur la marketplace`);
			finish();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Publication échouée",
			);
		} finally {
			setMarketplaceLoading(false);
		}
	}, [resource, ensureMarketplaceItemId, finish]);

	const handleOpenUserStep = useCallback(async () => {
		try {
			await loadUsers();
			setStep("user");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Impossible de charger les utilisateurs",
			);
		}
	}, [loadUsers]);

	const handleShareWithUser = useCallback(async () => {
		if (!resource || !selectedUserId) return;
		setBusy(true);
		try {
			const itemId = await ensureMarketplaceItemId();
			const shareRes = await fetch(`/api/marketplace/items/${itemId}/share`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ targetUserId: selectedUserId }),
			});
			if (!shareRes.ok) {
				const err = await shareRes.json().catch(() => ({}));
				throw new Error(err.error || "Partage échoué");
			}
			toast.success(`"${resource.name}" partagé avec succès`);
			finish();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Partage échoué");
		} finally {
			setBusy(false);
		}
	}, [resource, selectedUserId, ensureMarketplaceItemId, finish]);

	if (!resource) return null;

	return (
		<Dialog open={open} onOpenChange={(next) => !next && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Share2 className="size-4" />
						Partager &quot;{resource.name}&quot;
					</DialogTitle>
					<DialogDescription>
						{step === "choose"
							? `Où souhaitez-vous partager ${resourceSubject(resource.kind)} ?`
							: "Sélectionnez un utilisateur."}
					</DialogDescription>
				</DialogHeader>

				{step === "choose" ? (
					<div className="grid gap-3">
						<ShareOptionCard
							icon={Globe}
							title="Marketplace"
							description="Publier pour que tout le monde puisse l'installer"
							onClick={() => void handlePublishToMarketplace()}
							loading={marketplaceLoading}
						/>
						<ShareOptionCard
							icon={Users}
							title="Un utilisateur"
							description="Partager en privé avec une personne"
							onClick={() => void handleOpenUserStep()}
							disabled={marketplaceLoading || busy}
						/>
					</div>
				) : (
					<div className="space-y-3">
						<Input
							placeholder="Rechercher par nom ou email..."
							value={search}
							onChange={(e) => setSearch(e.target.value)}
						/>
						<div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-border/70 p-1">
							{filteredUsers.map((user) => (
								<button
									key={user.id}
									type="button"
									className={cn(
										"w-full rounded-md px-3 py-2 text-left text-sm flex items-center justify-between",
										selectedUserId === user.id
											? "bg-primary/10 font-medium"
											: "hover:bg-muted",
									)}
									onClick={() =>
										setSelectedUserId(selectedUserId === user.id ? "" : user.id)
									}
								>
									<span className="truncate">
										{user.name}{" "}
										<span className="text-muted-foreground">({user.email})</span>
									</span>
									{selectedUserId === user.id ? (
										<Star className="h-3 w-3 shrink-0 fill-primary text-primary" />
									) : null}
								</button>
							))}
							{filteredUsers.length === 0 ? (
								<p className="px-3 py-2 text-sm text-muted-foreground">
									Aucun utilisateur trouvé
								</p>
							) : null}
						</div>
					</div>
				)}

				<DialogFooter className="gap-2 sm:gap-0">
					{step === "user" ? (
						<>
							<Button
								variant="outline"
								onClick={() => setStep("choose")}
								disabled={busy}
							>
								Retour
							</Button>
							<Button
								disabled={!selectedUserId || busy}
								onClick={() => void handleShareWithUser()}
							>
								{busy ? <Spinner className="size-4 mr-1" /> : null}
								<User className="size-4 mr-1" />
								Partager
							</Button>
						</>
					) : (
						<Button
							variant="outline"
							onClick={onClose}
							disabled={marketplaceLoading}
						>
							Annuler
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
