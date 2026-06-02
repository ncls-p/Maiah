"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { type SyntheticEvent, useCallback, useEffect, useState } from "react";
import {
	ArrowLeftIcon,
	BookOpenIcon,
	ChevronDownIcon,
	SaveIcon,
	ServerIcon,
	WrenchIcon,
	SparklesIcon,
	SettingsIcon,
	InfoIcon,
	ZapIcon,
	SlidersIcon,
	BrainIcon,
	ShieldCheckIcon,
	AlertCircleIcon,
} from "lucide-react";
import { toast } from "sonner";

import { ListRow } from "@/components/list-row";
import { PageLoading } from "@/components/page-loading";
import { WorkspacePage } from "@/components/workspace-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	Field,
	FieldContent,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";

type Agent = {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	sharingMode: "personal" | "marketplace" | "specific_user";
	isGlobal: boolean;
	isRecommended: boolean;
	curationLabel: string | null;
	canAdminCurate: boolean;
};

type Provider = { id: string; name: string; kind: string };
type Model = {
	id: string;
	providerId: string;
	modelId: string;
	displayName: string | null;
};
type BuiltinTool = {
	id: string;
	name: string;
	description: string;
	riskLevel: string;
};
type McpServer = { id: string; name: string; requireApproval: boolean };
type McpTool = {
	id: string;
	name: string;
	description: string | null;
	mcpServerId: string;
	enabled: boolean;
	requireApproval: boolean;
};
type KnowledgeBase = { id: string; name: string };
type ToolBinding = {
	toolSource: string;
	toolId: string;
	requireApproval: boolean;
};
type KnowledgeBinding = {
	knowledgeBaseId: string;
	name: string;
};

const AVATAR_COLORS = [
	"from-violet-500 to-indigo-600",
	"from-cyan-500 to-blue-600",
	"from-emerald-500 to-teal-600",
	"from-amber-500 to-orange-600",
	"from-rose-500 to-pink-600",
	"from-fuchsia-500 to-purple-600",
	"from-lime-500 to-green-600",
	"from-sky-500 to-cyan-600",
];

function getAvatarColor(name: string): string {
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = name.charCodeAt(i) + ((hash << 5) - hash);
	}
	return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
	return name
		.split(/\s+/)
		.map((w) => w[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

function InfoCallout({
	title,
	children,
	icon: Icon = InfoIcon,
}: {
	title: string;
	children: React.ReactNode;
	icon?: typeof InfoIcon;
}) {
	return (
		<div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 p-4">
			<Icon
				className="size-4 shrink-0 mt-0.5 text-muted-foreground"
				aria-hidden="true"
			/>
			<div className="flex-1 text-sm">
				<p className="font-medium">{title}</p>
				<p className="mt-1 text-muted-foreground leading-relaxed">{children}</p>
			</div>
		</div>
	);
}

function SettingHint({ text }: { text: string }) {
	return (
		<TooltipProvider delayDuration={300}>
			<Tooltip>
				<TooltipTrigger asChild>
					<InfoIcon
						className="size-3.5 text-muted-foreground/50 cursor-help"
						aria-hidden="true"
					/>
				</TooltipTrigger>
				<TooltipContent side="top" className="max-w-xs text-xs">
					{text}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

export default function AgentConfigurePage() {
	const params = useParams<{ agentId: string }>();
	const agentId = params.agentId;
	const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
	const [agent, setAgent] = useState<Agent | null>(null);
	const [providers, setProviders] = useState<Provider[]>([]);
	const [models, setModels] = useState<Model[]>([]);
	const [builtinTools, setBuiltinTools] = useState<BuiltinTool[]>([]);
	const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
	const [mcpTools, setMcpTools] = useState<McpTool[]>([]);
	const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [form, setForm] = useState({
		name: "",
		description: "",
		systemPrompt: "",
		providerId: "",
		modelId: "",
		temperature: "0.7",
		maxOutputTokens: "1024",
		maxToolCalls: "6",
		sharingMode: "personal" as Agent["sharingMode"],
		shareTargetEmail: "",
		originalSharingMode: "personal" as Agent["sharingMode"],
		isGlobal: false,
		isRecommended: false,
		curationLabel: "none",
	});
	const [builtinBindings, setBuiltinBindings] = useState<
		Record<string, { enabled: boolean; requireApproval: boolean }>
	>({});
	const [mcpBindings, setMcpBindings] = useState<
		Record<string, { enabled: boolean; requireApproval: boolean }>
	>({});
	const [openMcpServerIds, setOpenMcpServerIds] = useState<
		Record<string, boolean>
	>({});
	const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState<string[]>(
		[],
	);

	const loadData = useCallback(async () => {
		if (!agentId || !workspaceId) return;
		const [
			agentRes,
			versionsRes,
			providersRes,
			toolsRes,
			mcpRes,
			kbRes,
			bindingsRes,
			knowledgeBindingsRes,
		] = await Promise.all([
			fetch(`/api/workspace/agents/${agentId}?workspaceId=${workspaceId}`),
			fetch(
				`/api/workspace/agents/${agentId}/versions?workspaceId=${workspaceId}`,
			),
			fetch(`/api/workspace/providers?workspaceId=${workspaceId}`),
			fetch(`/api/workspace/tools?workspaceId=${workspaceId}`),
			fetch(`/api/workspace/mcp-servers?workspaceId=${workspaceId}`),
			fetch(`/api/workspace/knowledge-bases?workspaceId=${workspaceId}`),
			fetch(
				`/api/workspace/agents/${agentId}/tools?workspaceId=${workspaceId}`,
			),
			fetch(
				`/api/workspace/agents/${agentId}/knowledge?workspaceId=${workspaceId}`,
			),
		]);

		if (
			!agentRes.ok ||
			!versionsRes.ok ||
			!providersRes.ok ||
			!toolsRes.ok ||
			!mcpRes.ok ||
			!kbRes.ok
		) {
			throw new Error("Unable to load agent settings");
		}

		const nextAgent = (await agentRes.json()) as Agent;
		const versions = (await versionsRes.json()) as Array<{
			isActive: boolean;
			systemPrompt: string | null;
			providerId: string | null;
			modelId: string | null;
			temperature: string | null;
			maxOutputTokens: number | null;
			maxToolCalls: number | null;
		}>;
		const providerRows = (await providersRes.json()) as Provider[];
		const builtinRows = (await toolsRes.json()) as BuiltinTool[];
		const mcpServerRows = (await mcpRes.json()) as McpServer[];
		const kbRows = (await kbRes.json()) as KnowledgeBase[];
		const toolBindings = bindingsRes.ok
			? ((await bindingsRes.json()) as ToolBinding[])
			: [];
		const knowledgeBindings = knowledgeBindingsRes.ok
			? (
					(await knowledgeBindingsRes.json()) as {
						bindings: KnowledgeBinding[];
					}
				).bindings
			: [];

		const activeVersion = versions.find((v) => v.isActive) ?? null;
		const modelRows = (
			await Promise.all(
				providerRows.map(async (provider) => {
					const res = await fetch(
						`/api/workspace/providers/${provider.id}/models?workspaceId=${workspaceId}`,
					);
					return res.ok ? ((await res.json()) as Model[]) : [];
				}),
			)
		).flat();

		const mcpToolRows = (
			await Promise.all(
				mcpServerRows.map(async (server) => {
					const res = await fetch(
						`/api/workspace/mcp-servers/${server.id}/tools?workspaceId=${workspaceId}`,
					);
					return res.ok ? ((await res.json()) as McpTool[]) : [];
				}),
			)
		).flat();

		setAgent(nextAgent);
		setProviders(providerRows);
		setModels(modelRows);
		setBuiltinTools(builtinRows);
		setMcpServers(mcpServerRows);
		setMcpTools(mcpToolRows);
		setKnowledgeBases(kbRows);
		setForm({
			name: nextAgent.name,
			description: nextAgent.description ?? "",
			systemPrompt: activeVersion?.systemPrompt ?? "",
			providerId: activeVersion?.providerId ?? "",
			modelId: activeVersion?.modelId ?? "",
			temperature: activeVersion?.temperature ?? "0.7",
			maxOutputTokens: String(activeVersion?.maxOutputTokens ?? 1024),
			maxToolCalls: String(activeVersion?.maxToolCalls ?? 6),
			sharingMode: nextAgent.sharingMode,
			shareTargetEmail: "",
			originalSharingMode: nextAgent.sharingMode,
			isGlobal: nextAgent.isGlobal,
			isRecommended: nextAgent.isRecommended,
			curationLabel: nextAgent.curationLabel ?? "none",
		});

		const nextBuiltin: Record<
			string,
			{ enabled: boolean; requireApproval: boolean }
		> = {};
		for (const tool of builtinRows) {
			const binding = toolBindings.find(
				(b) => b.toolSource === "builtin" && b.toolId === tool.id,
			);
			nextBuiltin[tool.id] = {
				enabled: Boolean(binding),
				requireApproval: binding?.requireApproval ?? false,
			};
		}
		setBuiltinBindings(nextBuiltin);

		const nextMcp: Record<
			string,
			{ enabled: boolean; requireApproval: boolean }
		> = {};
		for (const tool of mcpToolRows) {
			const binding = toolBindings.find(
				(b) => b.toolSource === "mcp" && b.toolId === tool.id,
			);
			nextMcp[tool.id] = {
				enabled: Boolean(binding),
				requireApproval: binding?.requireApproval ?? false,
			};
		}
		setMcpBindings(nextMcp);
		setSelectedKnowledgeIds(knowledgeBindings.map((b) => b.knowledgeBaseId));
	}, [agentId, workspaceId]);

	useEffect(() => {
		let cancelled = false;
		queueMicrotask(() => {
			void loadData()
				.catch((error) =>
					toast.error(
						error instanceof Error ? error.message : "Unable to load agent",
					),
				)
				.finally(() => {
					if (!cancelled) setLoading(false);
				});
		});
		return () => {
			cancelled = true;
		};
	}, [loadData]);

	const filteredModels = models.filter(
		(model) => model.providerId === form.providerId,
	);

	async function saveGeneralModel(event: SyntheticEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!agentId || !workspaceId) return;
		setSaving(true);
		try {
			const res = await fetch(`/api/workspace/agents/${agentId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					workspaceId,
					name: form.name,
					description: form.description,
					systemPrompt: form.systemPrompt,
					providerId: form.providerId || undefined,
					modelId: form.modelId || undefined,
					temperature: form.temperature,
					maxOutputTokens: Number(form.maxOutputTokens) || undefined,
					maxToolCalls: Number(form.maxToolCalls),
					...(form.sharingMode !== form.originalSharingMode ||
					form.shareTargetEmail.trim()
						? {
								sharingMode: form.sharingMode,
								shareTargetEmail:
									form.sharingMode === "specific_user"
										? form.shareTargetEmail.trim()
										: undefined,
							}
						: {}),
					...(agent?.canAdminCurate
						? {
								isGlobal: form.isGlobal,
								isRecommended: form.isRecommended,
								curationLabel: form.curationLabel,
							}
						: {}),
				}),
			});
			if (!res.ok) {
				throw new Error(
					(await res.json().catch(() => null))?.error || "Unable to save agent",
				);
			}
			const data = await res.json();
			if (data.agent) {
				setAgent({
					...data.agent,
					canAdminCurate: agent?.canAdminCurate ?? false,
				});
				setForm((current) => ({
					...current,
					originalSharingMode: data.agent.sharingMode,
					shareTargetEmail: "",
				}));
			}
			toast.success("Agent saved");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to save agent",
			);
		} finally {
			setSaving(false);
		}
	}

	async function saveToolBindings() {
		if (!agentId || !workspaceId) return;
		setSaving(true);
		try {
			const bindings = [
				...builtinTools
					.filter((tool) => builtinBindings[tool.id]?.enabled)
					.map((tool) => ({
						toolSource: "builtin" as const,
						toolId: tool.id,
						requireApproval: builtinBindings[tool.id]?.requireApproval,
					})),
				...mcpTools
					.filter((tool) => tool.enabled && mcpBindings[tool.id]?.enabled)
					.map((tool) => ({
						toolSource: "mcp" as const,
						toolId: tool.id,
						mcpServerId: tool.mcpServerId,
						requireApproval:
							isMcpToolApprovalForced(tool) ||
							mcpBindings[tool.id]?.requireApproval,
					})),
			];
			const res = await fetch(
				`/api/workspace/agents/${agentId}/tools?workspaceId=${workspaceId}`,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ bindings }),
				},
			);
			if (!res.ok) {
				throw new Error(
					(await res.json().catch(() => null))?.error ||
						"Unable to save tool bindings",
				);
			}
			toast.success("Tool bindings saved");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to save tools",
			);
		} finally {
			setSaving(false);
		}
	}

	async function saveKnowledgeBindings() {
		if (!agentId || !workspaceId) return;
		setSaving(true);
		try {
			const res = await fetch(
				`/api/workspace/agents/${agentId}/knowledge?workspaceId=${workspaceId}`,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						workspaceId,
						knowledgeBaseIds: selectedKnowledgeIds,
					}),
				},
			);
			if (!res.ok) {
				throw new Error(
					(await res.json().catch(() => null))?.error ||
						"Unable to save knowledge bindings",
				);
			}
			toast.success("Knowledge bindings saved");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to save knowledge",
			);
		} finally {
			setSaving(false);
		}
	}

	function getServerTools(serverId: string) {
		return mcpTools.filter((tool) => tool.mcpServerId === serverId);
	}

	function getBindableServerTools(serverId: string) {
		return getServerTools(serverId).filter((tool) => tool.enabled);
	}

	function getMcpServer(serverId: string) {
		return mcpServers.find((server) => server.id === serverId);
	}

	function isMcpToolApprovalForced(tool: McpTool) {
		return (
			Boolean(getMcpServer(tool.mcpServerId)?.requireApproval) ||
			tool.requireApproval
		);
	}

	function setMcpServerToolsEnabled(serverId: string, enabled: boolean) {
		const serverTools = getServerTools(serverId);
		setMcpBindings((current) => {
			const next = { ...current };
			for (const tool of serverTools) {
				const currentBinding = current[tool.id];
				next[tool.id] = {
					enabled: enabled && tool.enabled,
					requireApproval:
						isMcpToolApprovalForced(tool) ||
						(currentBinding?.requireApproval ?? false),
				};
			}
			return next;
		});
	}

	function setMcpServerApproval(serverId: string, requireApproval: boolean) {
		const serverTools = getBindableServerTools(serverId);
		setMcpBindings((current) => {
			const next = { ...current };
			for (const tool of serverTools) {
				const currentBinding = current[tool.id];
				if (!currentBinding?.enabled) continue;
				const forcedApproval = isMcpToolApprovalForced(tool);
				next[tool.id] = {
					enabled: true,
					requireApproval: forcedApproval || requireApproval,
				};
			}
			return next;
		});
	}

	function setMcpToolEnabled(tool: McpTool, enabled: boolean) {
		setMcpBindings((current) => ({
			...current,
			[tool.id]: {
				enabled: enabled && tool.enabled,
				requireApproval:
					isMcpToolApprovalForced(tool) ||
					(current[tool.id]?.requireApproval ?? false),
			},
		}));
	}

	function setMcpToolApproval(tool: McpTool, requireApproval: boolean) {
		setMcpBindings((current) => ({
			...current,
			[tool.id]: {
				enabled: current[tool.id]?.enabled ?? false,
				requireApproval: tool.enabled
					? isMcpToolApprovalForced(tool) || requireApproval
					: false,
			},
		}));
	}

	function getMcpServerState(serverId: string) {
		const allTools = getServerTools(serverId);
		const bindableTools = allTools.filter((tool) => tool.enabled);
		const selectedTools = bindableTools.filter(
			(tool) => mcpBindings[tool.id]?.enabled,
		);
		const selectedApprovalTools = selectedTools.filter(
			(tool) =>
				isMcpToolApprovalForced(tool) || mcpBindings[tool.id]?.requireApproval,
		);
		const forcedApprovalCount = selectedTools.filter(
			isMcpToolApprovalForced,
		).length;

		return {
			allTools,
			bindableTools,
			selectedCount: selectedTools.length,
			forcedApprovalCount,
			allSelected:
				bindableTools.length > 0 &&
				selectedTools.length === bindableTools.length,
			someSelected:
				selectedTools.length > 0 && selectedTools.length < bindableTools.length,
			allApproval:
				selectedTools.length > 0 &&
				selectedApprovalTools.length === selectedTools.length,
			someApproval:
				selectedApprovalTools.length > 0 &&
				selectedApprovalTools.length < selectedTools.length,
		};
	}

	// Computed stats
	const enabledBuiltinCount = Object.values(builtinBindings).filter(
		(b) => b.enabled,
	).length;
	const enabledMcpCount = Object.values(mcpBindings).filter(
		(b) => b.enabled,
	).length;
	const hasModel = Boolean(form.providerId && form.modelId);

	if (workspaceLoading || !workspaceId || loading) {
		return <PageLoading label="Loading assistant" />;
	}

	const avatarColor = agent ? getAvatarColor(agent.name) : AVATAR_COLORS[0];
	const initials = agent ? getInitials(agent.name) : "?";

	return (
		<WorkspacePage
			kicker="Configuration"
			title="Assistant configuration"
			description="Tune identity, model behavior, tools, and knowledge for this assistant."
			width="default"
			actions={
				<Button asChild variant="outline" size="sm">
					<Link href="/agents">
						<ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
						All assistants
					</Link>
				</Button>
			}
		>
			{/* Agent identity header */}
			<div className="rounded-2xl border border-border/60 bg-gradient-to-br from-muted/40 to-muted/20 p-6">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
					{/* Avatar */}
					<div
						className={cn(
							"flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg",
							avatarColor,
						)}
					>
						<span className="text-xl font-bold">{initials}</span>
					</div>

					{/* Name + description + badges */}
					<div className="flex-1 min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<h2 className="text-2xl font-semibold tracking-tight">
								{agent?.name ?? "Assistant"}
							</h2>
							{hasModel ? (
								<Badge className="gap-1 bg-emerald-500/15 text-emerald-600">
									<SparklesIcon className="size-3" aria-hidden="true" />
									Model bound
								</Badge>
							) : (
								<Badge variant="outline" className="gap-1">
									<AlertCircleIcon className="size-3" aria-hidden="true" />
									No model
								</Badge>
							)}
							{agent?.sharingMode === "marketplace" && (
								<Badge variant="secondary">Workspace</Badge>
							)}
							{agent?.sharingMode === "specific_user" && (
								<Badge variant="secondary">Shared</Badge>
							)}
						</div>
						{agent?.description && (
							<p className="mt-1 text-sm text-muted-foreground">
								{agent.description}
							</p>
						)}
					</div>

					{/* Quick stats */}
					<div className="flex gap-3 sm:gap-4">
						<div className="flex flex-col items-center rounded-xl bg-background/60 px-4 py-2.5 text-center shadow-sm">
							<SlidersIcon
								className="size-4 text-muted-foreground"
								aria-hidden="true"
							/>
							<span className="mt-1 text-lg font-semibold">
								{enabledBuiltinCount + enabledMcpCount}
							</span>
							<span className="text-[10px] uppercase tracking-wider text-muted-foreground">
								Tools
							</span>
						</div>
						<div className="flex flex-col items-center rounded-xl bg-background/60 px-4 py-2.5 text-center shadow-sm">
							<BrainIcon
								className="size-4 text-muted-foreground"
								aria-hidden="true"
							/>
							<span className="mt-1 text-lg font-semibold">
								{selectedKnowledgeIds.length}
							</span>
							<span className="text-[10px] uppercase tracking-wider text-muted-foreground">
								Knowledge
							</span>
						</div>
						<div className="flex flex-col items-center rounded-xl bg-background/60 px-4 py-2.5 text-center shadow-sm">
							<ZapIcon
								className="size-4 text-muted-foreground"
								aria-hidden="true"
							/>
							<span className="mt-1 text-lg font-semibold">
								{enabledMcpCount}
							</span>
							<span className="text-[10px] uppercase tracking-wider text-muted-foreground">
								MCP
							</span>
						</div>
					</div>
				</div>
			</div>

			{/* Tabs */}
			<Tabs defaultValue="general">
				<TabsList className="w-full flex-wrap">
					<TabsTrigger value="general" className="gap-2">
						<SettingsIcon className="size-4" aria-hidden="true" />
						Basics
					</TabsTrigger>
					<TabsTrigger value="model" className="gap-2">
						<BrainIcon className="size-4" aria-hidden="true" />
						Model
					</TabsTrigger>
					<TabsTrigger value="tools" className="gap-2">
						<WrenchIcon className="size-4" aria-hidden="true" />
						Tools
						{enabledBuiltinCount + enabledMcpCount > 0 && (
							<Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
								{enabledBuiltinCount + enabledMcpCount}
							</Badge>
						)}
					</TabsTrigger>
					<TabsTrigger value="knowledge" className="gap-2">
						<BookOpenIcon className="size-4" aria-hidden="true" />
						Knowledge
						{selectedKnowledgeIds.length > 0 && (
							<Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
								{selectedKnowledgeIds.length}
							</Badge>
						)}
					</TabsTrigger>
				</TabsList>

				{/* BASICS TAB */}
				<TabsContent value="general" className="mt-4 space-y-4">
					<InfoCallout title="About this section">
						Set your assistant&apos;s identity and who can use it. The name and
						description appear in chat and the assistant listing. Sharing
						controls determine visibility within your workspace.
					</InfoCallout>

					<Card>
						<CardHeader>
							<CardTitle>Identity</CardTitle>
							<CardDescription>
								Name and description for this assistant.
							</CardDescription>
						</CardHeader>
						<form onSubmit={saveGeneralModel}>
							<CardContent>
								<FieldGroup>
									<Field>
										<FieldLabel htmlFor="agent-name">Name</FieldLabel>
										<FieldContent>
											<Input
												id="agent-name"
												required
												value={form.name}
												onChange={(e) =>
													setForm({ ...form, name: e.target.value })
												}
											/>
										</FieldContent>
									</Field>
									<Field>
										<div className="flex items-center gap-2">
											<FieldLabel htmlFor="agent-description">
												Description
											</FieldLabel>
											<SettingHint text="A short description helps users understand what this assistant does. Shown in the assistant listing and chat header." />
										</div>
										<FieldContent>
											<Textarea
												id="agent-description"
												placeholder="A helpful assistant for…"
												value={form.description}
												onChange={(e) =>
													setForm({ ...form, description: e.target.value })
												}
											/>
										</FieldContent>
									</Field>
								</FieldGroup>
							</CardContent>
							<CardFooter className="justify-end">
								<Button type="submit" disabled={saving}>
									{saving ? (
										<Spinner data-icon="inline-start" />
									) : (
										<SaveIcon data-icon="inline-start" aria-hidden="true" />
									)}
									Save
								</Button>
							</CardFooter>
						</form>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Access & Sharing</CardTitle>
							<CardDescription>
								Control who can discover and use this assistant.
							</CardDescription>
						</CardHeader>
						<form onSubmit={saveGeneralModel}>
							<CardContent>
								<FieldGroup>
									<Field>
										<div className="flex items-center gap-2">
											<FieldLabel htmlFor="agent-sharing">
												Sharing mode
											</FieldLabel>
											<SettingHint text="Personal means only you can use it. Workspace makes it visible to everyone. Specific user shares with one person by email." />
										</div>
										<FieldContent>
											<Select
												value={form.sharingMode}
												onValueChange={(value) =>
													setForm({
														...form,
														sharingMode: value as Agent["sharingMode"],
													})
												}
											>
												<SelectTrigger id="agent-sharing" className="w-full">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="personal">Personal</SelectItem>
													<SelectItem value="marketplace">
														Share with workspace
													</SelectItem>
													<SelectItem value="specific_user">
														Specific user
													</SelectItem>
												</SelectContent>
											</Select>
										</FieldContent>
									</Field>
									{form.sharingMode === "specific_user" ? (
										<Field>
											<FieldLabel htmlFor="agent-share-email">
												Shared user email
											</FieldLabel>
											<FieldContent>
												<Input
													id="agent-share-email"
													type="email"
													placeholder="colleague@example.com"
													value={form.shareTargetEmail}
													onChange={(e) =>
														setForm({
															...form,
															shareTargetEmail: e.target.value,
														})
													}
												/>
											</FieldContent>
										</Field>
									) : null}
								</FieldGroup>
							</CardContent>
							<CardFooter className="justify-end">
								<Button type="submit" disabled={saving}>
									{saving ? (
										<Spinner data-icon="inline-start" />
									) : (
										<SaveIcon data-icon="inline-start" aria-hidden="true" />
									)}
									Save
								</Button>
							</CardFooter>
						</form>
					</Card>
				</TabsContent>

				{/* MODEL TAB */}
				<TabsContent value="model" className="mt-4 space-y-4">
					<InfoCallout title="About models" icon={BrainIcon}>
						Choose an AI provider and model for this assistant. The model
						determines the assistant&apos;s reasoning ability, knowledge cutoff,
						and response style. The system prompt guides how it behaves — be
						specific about its role, tone, and constraints.
					</InfoCallout>

					<Card>
						<CardHeader>
							<CardTitle>Provider & Model</CardTitle>
							<CardDescription>
								Select the AI provider and specific model for this assistant.
							</CardDescription>
						</CardHeader>
						<form onSubmit={saveGeneralModel}>
							<CardContent>
								<FieldGroup>
									<Field>
										<div className="flex items-center gap-2">
											<FieldLabel htmlFor="agent-provider">Provider</FieldLabel>
											<SettingHint text="The AI provider hosts the model. You need to configure provider credentials in Settings &gt; Providers first." />
										</div>
										<FieldContent>
											<Select
												value={form.providerId || "__none__"}
												onValueChange={(value) =>
													setForm({
														...form,
														providerId: value === "__none__" ? "" : value,
														modelId: "",
													})
												}
											>
												<SelectTrigger id="agent-provider" className="w-full">
													<SelectValue placeholder="No provider" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="__none__">No provider</SelectItem>
													{providers.map((provider) => (
														<SelectItem key={provider.id} value={provider.id}>
															{provider.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</FieldContent>
									</Field>
									<Field>
										<div className="flex items-center gap-2">
											<FieldLabel htmlFor="agent-model">Model</FieldLabel>
											<SettingHint text="Different models vary in capability, speed, and cost. Larger models are generally more capable but slower and more expensive." />
										</div>
										<FieldContent>
											<Select
												value={form.modelId || "__none__"}
												onValueChange={(value) =>
													setForm({
														...form,
														modelId: value === "__none__" ? "" : value,
													})
												}
												disabled={!form.providerId}
											>
												<SelectTrigger id="agent-model" className="w-full">
													<SelectValue placeholder="No model" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="__none__">No model</SelectItem>
													{filteredModels.map((model) => (
														<SelectItem key={model.id} value={model.id}>
															{model.displayName || model.modelId}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</FieldContent>
									</Field>
								</FieldGroup>
							</CardContent>
							<CardFooter className="justify-end">
								<Button type="submit" disabled={saving}>
									{saving ? (
										<Spinner data-icon="inline-start" />
									) : (
										<SaveIcon data-icon="inline-start" aria-hidden="true" />
									)}
									Save
								</Button>
							</CardFooter>
						</form>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>System Prompt</CardTitle>
							<CardDescription>
								The system prompt defines the assistant&apos;s behavior, tone,
								and constraints.
							</CardDescription>
						</CardHeader>
						<form onSubmit={saveGeneralModel}>
							<CardContent>
								<FieldGroup>
									<Field>
										<div className="flex items-center gap-2">
											<FieldLabel htmlFor="agent-prompt">
												System prompt
											</FieldLabel>
											<SettingHint text="This prompt runs before every conversation. Use it to set the assistant&apos;s role, personality, response format, and any rules it should follow. Leave empty for default behavior." />
										</div>
										<FieldContent>
											<Textarea
												id="agent-prompt"
												className="min-h-40 font-mono text-sm"
												placeholder="You are a helpful coding assistant. You write clean, well-documented code and explain your reasoning…"
												value={form.systemPrompt}
												onChange={(e) =>
													setForm({ ...form, systemPrompt: e.target.value })
												}
											/>
										</FieldContent>
									</Field>
								</FieldGroup>
							</CardContent>
							<CardFooter className="justify-end">
								<Button type="submit" disabled={saving}>
									{saving ? (
										<Spinner data-icon="inline-start" />
									) : (
										<SaveIcon data-icon="inline-start" aria-hidden="true" />
									)}
									Save
								</Button>
							</CardFooter>
						</form>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Generation Parameters</CardTitle>
							<CardDescription>
								Fine-tune how the model generates responses.
							</CardDescription>
						</CardHeader>
						<form onSubmit={saveGeneralModel}>
							<CardContent>
								<div className="grid gap-4 sm:grid-cols-3">
									<Field>
										<div className="flex items-center gap-2">
											<FieldLabel htmlFor="agent-temperature">
												Temperature
											</FieldLabel>
											<SettingHint text="Controls randomness: 0 = deterministic, 0.7 = balanced, 1.0 = creative. Lower values for factual tasks, higher for creative work." />
										</div>
										<FieldContent>
											<Input
												id="agent-temperature"
												type="number"
												min={0}
												max={2}
												step={0.1}
												value={form.temperature}
												onChange={(e) =>
													setForm({ ...form, temperature: e.target.value })
												}
											/>
										</FieldContent>
									</Field>
									<Field>
										<div className="flex items-center gap-2">
											<FieldLabel htmlFor="agent-max-output">
												Max output tokens
											</FieldLabel>
											<SettingHint text="Maximum length of the model&apos;s response in tokens. Higher values allow longer responses but cost more. 1024 is good for most tasks." />
										</div>
										<FieldContent>
											<Input
												id="agent-max-output"
												type="number"
												min={1}
												value={form.maxOutputTokens}
												onChange={(e) =>
													setForm({
														...form,
														maxOutputTokens: e.target.value,
													})
												}
											/>
										</FieldContent>
									</Field>
									<Field>
										<div className="flex items-center gap-2">
											<FieldLabel htmlFor="agent-max-tool-calls">
												Max tool uses
											</FieldLabel>
											<SettingHint text="How many times the assistant can call tools in a single response. More allows complex multi-step tasks but increases latency." />
										</div>
										<FieldContent>
											<Input
												id="agent-max-tool-calls"
												type="number"
												min={0}
												max={20}
												value={form.maxToolCalls}
												onChange={(e) =>
													setForm({
														...form,
														maxToolCalls: e.target.value,
													})
												}
											/>
										</FieldContent>
									</Field>
								</div>
							</CardContent>
							<CardFooter className="justify-end">
								<Button type="submit" disabled={saving}>
									{saving ? (
										<Spinner data-icon="inline-start" />
									) : (
										<SaveIcon data-icon="inline-start" aria-hidden="true" />
									)}
									Save
								</Button>
							</CardFooter>
						</form>
					</Card>
				</TabsContent>

				{/* TOOLS TAB */}
				<TabsContent value="tools" className="mt-4 space-y-4">
					<InfoCallout title="About tools" icon={WrenchIcon}>
						Tools give your assistant the ability to perform actions beyond text
						generation. Built-in tools are provided by the platform. MCP (Model
						Context Protocol) tools connect to external services. Enable
						&quot;Approval&quot; to require user confirmation before a tool
						runs.
					</InfoCallout>

					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<WrenchIcon className="size-5" aria-hidden="true" />
								Built-in Tools
							</CardTitle>
							<CardDescription>
								Platform-provided tools. Toggle to enable and set approval
								requirements.
								{enabledBuiltinCount > 0 && (
									<span className="ml-2">({enabledBuiltinCount} enabled)</span>
								)}
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-2">
							{builtinTools.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									No built-in tools available.
								</p>
							) : (
								builtinTools.map((tool) => (
									<ListRow
										key={tool.id}
										className="items-center justify-between"
									>
										<div className="min-w-0">
											<div className="flex items-center gap-2">
												<p className="font-medium">{tool.name}</p>
												<Badge
													variant={
														tool.riskLevel === "high"
															? "destructive"
															: tool.riskLevel === "medium"
																? "secondary"
																: "outline"
													}
													className="text-[10px]"
												>
													{tool.riskLevel} risk
												</Badge>
											</div>
											<p className="mt-0.5 text-xs text-muted-foreground">
												{tool.description}
											</p>
										</div>
										<div className="flex items-center gap-4">
											<label className="flex items-center gap-2 text-xs">
												<ShieldCheckIcon
													className="size-3 text-muted-foreground"
													aria-hidden="true"
												/>
												Approval
												<Switch
													checked={
														builtinBindings[tool.id]?.requireApproval ?? false
													}
													disabled={!builtinBindings[tool.id]?.enabled}
													onCheckedChange={(checked) =>
														setBuiltinBindings((current) => ({
															...current,
															[tool.id]: {
																enabled: current[tool.id]?.enabled ?? false,
																requireApproval: checked,
															},
														}))
													}
												/>
											</label>
											<Switch
												checked={builtinBindings[tool.id]?.enabled ?? false}
												onCheckedChange={(checked) =>
													setBuiltinBindings((current) => ({
														...current,
														[tool.id]: {
															enabled: checked,
															requireApproval:
																current[tool.id]?.requireApproval ?? false,
														},
													}))
												}
											/>
										</div>
									</ListRow>
								))
							)}
						</CardContent>

						<div className="border-t border-border/60" />

						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<ServerIcon className="size-5" aria-hidden="true" />
								MCP Tools
							</CardTitle>
							<CardDescription>
								External tools via MCP servers. Configure per-server and
								per-tool.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-3">
							{mcpServers.length === 0 ? (
								<div className="rounded-xl border border-dashed border-border/60 p-6 text-center">
									<ServerIcon
										className="mx-auto size-8 text-muted-foreground/50"
										aria-hidden="true"
									/>
									<p className="mt-2 text-sm font-medium">
										No MCP servers configured
									</p>
									<p className="mt-1 text-sm text-muted-foreground">
										Connect an MCP server to give your assistant access to
										external tools.
									</p>
									<Button variant="outline" size="sm" asChild className="mt-3">
										<Link href="/mcp">Add MCP server</Link>
									</Button>
								</div>
							) : (
								mcpServers.map((server) => {
									const serverState = getMcpServerState(server.id);
									const serverOpen =
										openMcpServerIds[server.id] ??
										serverState.selectedCount > 0;
									return (
										<Collapsible
											key={server.id}
											open={serverOpen}
											onOpenChange={(open) =>
												setOpenMcpServerIds((current) => ({
													...current,
													[server.id]: open,
												}))
											}
											className="rounded-xl border border-border/60 p-3"
										>
											<div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
												<div className="flex min-w-0 gap-2">
													<CollapsibleTrigger asChild>
														<Button
															type="button"
															variant="ghost"
															size="icon"
															aria-label={
																serverOpen
																	? `Collapse ${server.name}`
																	: `Expand ${server.name}`
															}
															className="shrink-0"
														>
															<ChevronDownIcon
																data-icon="inline-start"
																className={cn(
																	"transition-transform",
																	serverOpen && "rotate-180",
																)}
																aria-hidden="true"
															/>
														</Button>
													</CollapsibleTrigger>
													<div className="min-w-0">
														<div className="flex flex-wrap items-center gap-2">
															<p className="font-medium">{server.name}</p>
															<Badge variant="secondary">
																{serverState.selectedCount}/
																{serverState.bindableTools.length}
															</Badge>
															{serverState.someSelected ? (
																<Badge variant="outline">Partial</Badge>
															) : null}
															{serverState.someApproval ? (
																<Badge variant="outline">Mixed approval</Badge>
															) : null}
															{serverState.forcedApprovalCount > 0 ? (
																<Badge variant="secondary">
																	{serverState.forcedApprovalCount} forced
																</Badge>
															) : null}
														</div>
														<p className="mt-1 text-xs text-muted-foreground">
															{serverState.bindableTools.length} available tool
															{serverState.bindableTools.length !== 1 && "s"}
															{" · "}
															{serverState.selectedCount} bound to this
															assistant
														</p>
													</div>
												</div>
												<div className="flex flex-wrap items-center gap-4 text-xs">
													<label className="flex items-center gap-2">
														All tools
														<Switch
															checked={serverState.allSelected}
															disabled={serverState.bindableTools.length === 0}
															onCheckedChange={(checked) =>
																setMcpServerToolsEnabled(server.id, checked)
															}
														/>
													</label>
													<label className="flex items-center gap-2">
														Extra approval
														<Switch
															checked={serverState.allApproval}
															disabled={
																serverState.selectedCount === 0 ||
																serverState.selectedCount ===
																	serverState.forcedApprovalCount
															}
															onCheckedChange={(checked) =>
																setMcpServerApproval(server.id, checked)
															}
														/>
													</label>
												</div>
											</div>
											<CollapsibleContent className="flex flex-col gap-2 pt-3">
												{serverState.allTools.length === 0 ? (
													<p className="text-sm text-muted-foreground">
														No tools synced yet. Sync this MCP server before
														binding it to an assistant.
													</p>
												) : (
													serverState.allTools.map((tool) => {
														const binding = mcpBindings[tool.id];
														const toolSelected =
															tool.enabled && Boolean(binding?.enabled);
														const approvalForced =
															isMcpToolApprovalForced(tool);
														return (
															<ListRow
																key={tool.id}
																className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
															>
																<div className="min-w-0">
																	<div className="flex flex-wrap items-center gap-2">
																		<p className="font-medium">{tool.name}</p>
																		{!tool.enabled ? (
																			<Badge variant="outline">
																				Disabled in MCP
																			</Badge>
																		) : null}
																		{approvalForced ? (
																			<Badge variant="secondary">
																				Approval forced
																			</Badge>
																		) : null}
																	</div>
																	{tool.description ? (
																		<p className="mt-1 text-xs text-muted-foreground">
																			{tool.description}
																		</p>
																	) : null}
																</div>
																<div className="flex flex-wrap items-center gap-4 text-xs">
																	<label className="flex items-center gap-2">
																		<ShieldCheckIcon
																			className="size-3 text-muted-foreground"
																			aria-hidden="true"
																		/>
																		Approval
																		<Switch
																			checked={
																				tool.enabled &&
																				(approvalForced ||
																					Boolean(binding?.requireApproval))
																			}
																			disabled={!toolSelected || approvalForced}
																			onCheckedChange={(checked) =>
																				setMcpToolApproval(tool, checked)
																			}
																		/>
																	</label>
																	<label className="flex items-center gap-2">
																		Use
																		<Switch
																			checked={toolSelected}
																			disabled={!tool.enabled}
																			onCheckedChange={(checked) =>
																				setMcpToolEnabled(tool, checked)
																			}
																		/>
																	</label>
																</div>
															</ListRow>
														);
													})
												)}
											</CollapsibleContent>
										</Collapsible>
									);
								})
							)}
						</CardContent>
						<CardFooter className="justify-end">
							<Button onClick={() => void saveToolBindings()} disabled={saving}>
								{saving ? <Spinner data-icon="inline-start" /> : null}
								Save Tools
							</Button>
						</CardFooter>
					</Card>
				</TabsContent>

				{/* KNOWLEDGE TAB */}
				<TabsContent value="knowledge" className="mt-4 space-y-4">
					<InfoCallout title="About knowledge bases" icon={BookOpenIcon}>
						Knowledge bases give your assistant access to reference material.
						When enabled, the assistant searches bound knowledge bases during
						conversations and cites relevant passages. Create knowledge bases in
						the Knowledge section and bind them here.
					</InfoCallout>

					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<BookOpenIcon className="size-5" aria-hidden="true" />
								Knowledge Bases
							</CardTitle>
							<CardDescription>
								Select knowledge bases to search during chat.
								{selectedKnowledgeIds.length > 0 && (
									<span className="ml-1">
										({selectedKnowledgeIds.length} bound)
									</span>
								)}
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-2">
							{knowledgeBases.length === 0 ? (
								<div className="rounded-xl border border-dashed border-border/60 p-6 text-center">
									<BookOpenIcon
										className="mx-auto size-8 text-muted-foreground/50"
										aria-hidden="true"
									/>
									<p className="mt-2 text-sm font-medium">
										No knowledge bases yet
									</p>
									<p className="mt-1 text-sm text-muted-foreground">
										Create a knowledge base to give your assistant reference
										material it can cite in conversations.
									</p>
									<Button variant="outline" size="sm" asChild className="mt-3">
										<Link href="/knowledge">Create knowledge base</Link>
									</Button>
								</div>
							) : (
								knowledgeBases.map((kb) => (
									<label
										key={kb.id}
										className={cn(
											"ui-list-row flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-colors hover:bg-muted/30",
											selectedKnowledgeIds.includes(kb.id)
												? "border-primary/30 bg-primary/5"
												: "border-border/60",
										)}
									>
										<div className="flex items-center gap-3">
											<div
												className={cn(
													"flex size-8 items-center justify-center rounded-lg",
													selectedKnowledgeIds.includes(kb.id)
														? "bg-primary/10 text-primary"
														: "bg-muted text-muted-foreground",
												)}
											>
												<BookOpenIcon className="size-4" aria-hidden="true" />
											</div>
											<span className="font-medium">{kb.name}</span>
										</div>
										<Switch
											checked={selectedKnowledgeIds.includes(kb.id)}
											onCheckedChange={(checked) =>
												setSelectedKnowledgeIds((current) =>
													checked
														? [...current, kb.id]
														: current.filter((id) => id !== kb.id),
												)
											}
										/>
									</label>
								))
							)}
						</CardContent>
						<CardFooter className="justify-end">
							<Button
								onClick={() => void saveKnowledgeBindings()}
								disabled={saving}
							>
								{saving ? <Spinner data-icon="inline-start" /> : null}
								Save Knowledge
							</Button>
						</CardFooter>
					</Card>
				</TabsContent>
			</Tabs>
		</WorkspacePage>
	);
}
