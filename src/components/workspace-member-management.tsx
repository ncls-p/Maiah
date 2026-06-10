"use client";

import type { ElementType } from "react";
import { type SyntheticEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
	CrownIcon,
	Loader2,
	MailIcon,
	ShieldIcon,
	UserMinusIcon,
	UserPlusIcon,
	UsersIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";

type WorkspaceMember = {
	id: string;
	userId: string;
	name: string;
	email: string;
	roleName: string;
	createdAt: string;
};

type WorkspaceRole =
	| "workspace.member"
	| "workspace.owner"
	| "workspace.admin";

function initialsFromName(name: string) {
	return (
		name
			.split(/\s+/)
			.map((part) => part[0])
			.join("")
			.slice(0, 2)
			.toUpperCase() || "?"
	);
}

function roleLabel(
	roleName: string,
	t: ReturnType<typeof useTranslations<"admin.members">>,
) {
	switch (roleName) {
		case "workspace.owner":
			return t("roleOwner");
		case "workspace.admin":
			return t("roleAdmin");
		default:
			return t("roleMember");
	}
}

function roleBadgeClass(roleName: string) {
	switch (roleName) {
		case "workspace.owner":
			return "border-primary/30 bg-primary/10 text-primary";
		case "workspace.admin":
			return "border-info/30 bg-info/10 text-info";
		default:
			return "";
	}
}

function StatCard({
	label,
	value,
	icon: Icon,
	color,
	accent,
}: {
	label: string;
	value: string | number;
	icon: ElementType;
	color: string;
	accent: string;
}) {
	return (
		<div className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-colors hover:border-primary/35">
			<div
				className={cn(
					"absolute left-0 top-0 h-full w-1 opacity-60 transition-opacity duration-300 group-hover:opacity-100",
					accent,
				)}
			/>
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 flex-col gap-1">
					<span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
						{label}
					</span>
					<span className="text-2xl font-bold tracking-tight text-foreground">
						{value}
					</span>
				</div>
				<div
					className={cn(
						"flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110",
						color,
					)}
				>
					<Icon className="size-5" aria-hidden="true" />
				</div>
			</div>
		</div>
	);
}

function MemberAvatar({ name, isCurrentUser }: { name: string; isCurrentUser: boolean }) {
	return (
		<div
			className={cn(
				"flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-2 ring-background",
				isCurrentUser
					? "bg-primary text-primary-foreground"
					: "bg-primary/10 text-primary",
			)}
		>
			{initialsFromName(name)}
		</div>
	);
}

function MembersSkeleton() {
	return (
		<div className="flex flex-col gap-6">
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				{Array.from({ length: 4 }).map((_, index) => (
					<Skeleton key={index} className="h-24 rounded-2xl" />
				))}
			</div>
			<Skeleton className="h-36 rounded-2xl" />
			<Skeleton className="h-64 rounded-2xl" />
		</div>
	);
}

export function WorkspaceMemberManagement({
	currentUserId,
}: {
	currentUserId: string;
}) {
	const t = useTranslations("admin.members");
	const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
	const [members, setMembers] = useState<WorkspaceMember[]>([]);
	const [loading, setLoading] = useState(true);
	const [inviting, setInviting] = useState(false);
	const [busyUserId, setBusyUserId] = useState<string | null>(null);
	const [email, setEmail] = useState("");
	const [roleName, setRoleName] = useState<WorkspaceRole>("workspace.member");

	const stats = useMemo(() => {
		return members.reduce(
			(acc, member) => {
				acc.total += 1;
				if (member.roleName === "workspace.owner") acc.owners += 1;
				else if (member.roleName === "workspace.admin") acc.admins += 1;
				else acc.members += 1;
				return acc;
			},
			{ total: 0, owners: 0, admins: 0, members: 0 },
		);
	}, [members]);

	const loadMembers = useCallback(async () => {
		if (!workspaceId) return;
		const res = await fetch(
			`/api/workspace/members?workspaceId=${workspaceId}`,
		);
		if (!res.ok) throw new Error("Unable to load team members");
		const data = (await res.json()) as { members: WorkspaceMember[] };
		setMembers(data.members);
	}, [workspaceId]);

	useEffect(() => {
		if (!workspaceId) return;
		let cancelled = false;
		async function run() {
			try {
				await loadMembers();
			} catch (error) {
				if (!cancelled) {
					toast.error(
						error instanceof Error
							? error.message
							: "Unable to load team members",
					);
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		void run();
		return () => {
			cancelled = true;
		};
	}, [loadMembers, workspaceId]);

	async function updateMemberRole(userId: string, nextRole: WorkspaceRole) {
		if (!workspaceId) return;
		setBusyUserId(userId);
		try {
			const res = await fetch(`/api/workspace/members/${userId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workspaceId, roleName: nextRole }),
			});
			if (!res.ok) {
				throw new Error(
					(await res.json().catch(() => null))?.error ||
						"Unable to update role",
				);
			}
			await loadMembers();
			toast.success(t("roleUpdated"));
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to update role",
			);
		} finally {
			setBusyUserId(null);
		}
	}

	async function inviteMember(event: SyntheticEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!workspaceId) return;
		setInviting(true);
		try {
			const res = await fetch("/api/workspace/members", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workspaceId, email, roleName }),
			});
			if (!res.ok) {
				throw new Error(
					(await res.json().catch(() => null))?.error ||
						"Unable to invite member",
				);
			}
			setEmail("");
			await loadMembers();
			toast.success(t("memberAdded"));
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to invite member",
			);
		} finally {
			setInviting(false);
		}
	}

	async function removeMember(userId: string) {
		if (!workspaceId) return;
		setBusyUserId(userId);
		try {
			const res = await fetch(
				`/api/workspace/members/${userId}?workspaceId=${workspaceId}`,
				{ method: "DELETE" },
			);
			if (!res.ok) {
				throw new Error(
					(await res.json().catch(() => null))?.error ||
						"Unable to remove member",
				);
			}
			await loadMembers();
			toast.success(t("memberRemoved"));
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to remove member",
			);
		} finally {
			setBusyUserId(null);
		}
	}

	if (workspaceLoading || !workspaceId) {
		return <MembersSkeleton />;
	}

	if (loading) {
		return <MembersSkeleton />;
	}

	return (
		<div className="flex flex-col gap-6">
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4 animate-in-up stagger-1">
				<StatCard
					label={t("statTotal")}
					value={stats.total}
					icon={UsersIcon}
					color="bg-primary/10 text-primary"
					accent="bg-primary"
				/>
				<StatCard
					label={t("statOwners")}
					value={stats.owners}
					icon={CrownIcon}
					color="bg-primary/10 text-primary"
					accent="bg-primary"
				/>
				<StatCard
					label={t("statAdmins")}
					value={stats.admins}
					icon={ShieldIcon}
					color="bg-info/10 text-info"
					accent="bg-info"
				/>
				<StatCard
					label={t("statMembers")}
					value={stats.members}
					icon={UsersIcon}
					color="bg-muted text-muted-foreground"
					accent="bg-muted-foreground"
				/>
			</div>

			<section className="surface-panel animate-in-up stagger-2 overflow-hidden p-0">
				<div className="border-b border-border/60 bg-gradient-to-br from-primary/8 via-background to-chart-2/10 px-5 py-5 sm:px-6">
					<div className="flex items-center gap-2 text-primary">
						<UserPlusIcon className="size-4" aria-hidden="true" />
						<h2 className="text-sm font-semibold uppercase tracking-wider">
							{t("inviteTitle")}
						</h2>
					</div>
					<p className="mt-2 max-w-2xl text-sm text-muted-foreground">
						{t("inviteDescription")}
					</p>
				</div>
				<form
					className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end sm:px-6"
					onSubmit={(event) => void inviteMember(event)}
				>
					<div className="grid gap-2">
						<Label htmlFor="invite-email">{t("email")}</Label>
						<div className="relative">
							<MailIcon
								className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
								aria-hidden="true"
							/>
							<Input
								id="invite-email"
								type="email"
								autoComplete="email"
								className="pl-9"
								placeholder={t("emailPlaceholder")}
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								required
							/>
						</div>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="invite-role">{t("role")}</Label>
						<Select
							value={roleName}
							onValueChange={(value) => setRoleName(value as WorkspaceRole)}
						>
							<SelectTrigger id="invite-role">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="workspace.member">{t("roleMember")}</SelectItem>
								<SelectItem value="workspace.admin">{t("roleAdmin")}</SelectItem>
								<SelectItem value="workspace.owner">{t("roleOwner")}</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<Button type="submit" disabled={inviting} className="w-full sm:w-auto">
						{inviting ? (
							<Loader2 className="animate-spin" aria-hidden="true" />
						) : (
							<>
								<UserPlusIcon data-icon="inline-start" aria-hidden="true" />
								{t("inviteButton")}
							</>
						)}
					</Button>
				</form>
			</section>

			<section className="surface-panel animate-in-up stagger-3 p-5">
				<div className="mb-5 flex flex-col gap-1">
					<div className="flex items-center gap-2">
						<UsersIcon className="size-4 text-primary" aria-hidden="true" />
						<h2 className="text-base font-semibold">{t("listTitle")}</h2>
					</div>
					<p className="text-sm text-muted-foreground">{t("listDescription")}</p>
				</div>

				{members.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-12 text-center">
						<UsersIcon
							className="size-8 text-muted-foreground/60"
							aria-hidden="true"
						/>
						<p className="text-sm font-medium text-foreground">{t("emptyTitle")}</p>
						<p className="max-w-sm text-sm text-muted-foreground">
							{t("emptyDescription")}
						</p>
					</div>
				) : (
					<ul className="flex flex-col gap-2">
						{members.map((member) => {
							const isCurrentUser = member.userId === currentUserId;
							return (
								<li
									key={member.id}
									className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/80 px-4 py-3 transition-colors hover:border-primary/25 hover:bg-muted/20 sm:flex-row sm:items-center sm:justify-between"
								>
									<div className="flex min-w-0 items-center gap-3">
										<MemberAvatar
											name={member.name}
											isCurrentUser={isCurrentUser}
										/>
										<div className="min-w-0">
											<div className="flex flex-wrap items-center gap-2">
												<p className="truncate font-medium">{member.name}</p>
												{isCurrentUser ? (
													<Badge variant="outline" className="rounded-md">
														{t("you")}
													</Badge>
												) : null}
												<Badge
													variant="outline"
													className={cn(
														"rounded-md capitalize",
														roleBadgeClass(member.roleName),
													)}
												>
													{roleLabel(member.roleName, t)}
												</Badge>
											</div>
											<p className="truncate text-sm text-muted-foreground">
												{member.email}
											</p>
										</div>
									</div>

									<div className="flex shrink-0 items-center gap-2 sm:pl-0 pl-14">
										<Select
											aria-label={t("roleFor", { name: member.name })}
											value={member.roleName}
											onValueChange={(value) =>
												void updateMemberRole(
													member.userId,
													value as WorkspaceRole,
												)
											}
											disabled={busyUserId === member.userId}
										>
											<SelectTrigger className="h-9 w-[8.5rem]">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="workspace.member">
													{t("roleMember")}
												</SelectItem>
												<SelectItem value="workspace.admin">
													{t("roleAdmin")}
												</SelectItem>
												<SelectItem value="workspace.owner">
													{t("roleOwner")}
												</SelectItem>
											</SelectContent>
										</Select>
										{!isCurrentUser ? (
											<Button
												type="button"
												variant="ghost"
												size="icon-sm"
												disabled={busyUserId === member.userId}
												onClick={() => void removeMember(member.userId)}
												aria-label={t("removeMember", { name: member.name })}
											>
												{busyUserId === member.userId ? (
													<Loader2
														className="size-4 animate-spin"
														aria-hidden="true"
													/>
												) : (
													<UserMinusIcon aria-hidden="true" />
												)}
											</Button>
										) : null}
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</section>
		</div>
	);
}
