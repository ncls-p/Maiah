"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { type SyntheticEvent, useEffect, useState } from "react";
import { ArrowLeftIcon, Loader2, SaveIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Field,
	FieldContent,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

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

type AgentVersion = {
	id: string;
	systemPrompt: string | null;
	providerId: string | null;
	modelId: string | null;
	temperature: string | null;
	maxOutputTokens: number | null;
	isActive: boolean;
};

type Provider = {
	id: string;
	name: string;
	kind: string;
};

type Model = {
	id: string;
	providerId: string;
	modelId: string;
	displayName: string | null;
};

function getBrowserWorkspaceId() {
	return typeof window === "undefined"
		? null
		: window.sessionStorage.getItem("active_workspace_id");
}

export default function AgentConfigurePage() {
	const params = useParams<{ agentId: string }>();
	const agentId = params.agentId;
	const [workspaceId, setWorkspaceId] = useState<string | null>(() =>
		getBrowserWorkspaceId(),
	);
	const [agent, setAgent] = useState<Agent | null>(null);
	const [providers, setProviders] = useState<Provider[]>([]);
	const [models, setModels] = useState<Model[]>([]);
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
		sharingMode: "personal" as Agent["sharingMode"],
		shareTargetEmail: "",
		originalSharingMode: "personal" as Agent["sharingMode"],
		isGlobal: false,
		isRecommended: false,
		curationLabel: "none",
	});

	useEffect(() => {
		if (workspaceId) return;
		let cancelled = false;
		queueMicrotask(() => {
			void fetch("/api/workspaces")
				.then((res) => res.json())
				.then((rows) => {
					if (cancelled || !Array.isArray(rows)) return;
					const id = rows[0]?.workspace?.id || rows[0]?.id;
					if (id) {
						setWorkspaceId(id);
						window.sessionStorage.setItem("active_workspace_id", id);
					}
				})
				.catch(() => toast.error("Unable to load workspace"));
		});
		return () => {
			cancelled = true;
		};
	}, [workspaceId]);

	useEffect(() => {
		if (!agentId || !workspaceId) return;
		let cancelled = false;
		async function load() {
			const [agentRes, versionsRes, providersRes] = await Promise.all([
				fetch(`/api/workspace/agents/${agentId}?workspaceId=${workspaceId}`),
				fetch(
					`/api/workspace/agents/${agentId}/versions?workspaceId=${workspaceId}`,
				),
				fetch(`/api/workspace/providers?workspaceId=${workspaceId}`),
			]);
			if (!agentRes.ok || !versionsRes.ok || !providersRes.ok) {
				throw new Error("Unable to load agent settings");
			}
			const nextAgent = (await agentRes.json()) as Agent;
			const versions = (await versionsRes.json()) as AgentVersion[];
			const providerRows = (await providersRes.json()) as Provider[];
			const activeVersion =
				versions.find((version) => version.isActive) ?? null;
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
			if (cancelled) return;
			setAgent(nextAgent);
			setProviders(providerRows);
			setModels(modelRows);
			setForm({
				name: nextAgent.name,
				description: nextAgent.description ?? "",
				systemPrompt: activeVersion?.systemPrompt ?? "",
				providerId: activeVersion?.providerId ?? "",
				modelId: activeVersion?.modelId ?? "",
				temperature: activeVersion?.temperature ?? "0.7",
				maxOutputTokens: String(activeVersion?.maxOutputTokens ?? 1024),
				sharingMode: nextAgent.sharingMode,
				shareTargetEmail: "",
				originalSharingMode: nextAgent.sharingMode,
				isGlobal: nextAgent.isGlobal,
				isRecommended: nextAgent.isRecommended,
				curationLabel: nextAgent.curationLabel ?? "none",
			});
		}
		queueMicrotask(() => {
			void load()
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
	}, [agentId, workspaceId]);

	const filteredModels = models.filter(
		(model) => model.providerId === form.providerId,
	);

	async function save(event: SyntheticEvent<HTMLFormElement>) {
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

	if (loading) {
		return (
			<div className="flex h-full items-center justify-center">
				<Loader2
					className="animate-spin text-muted-foreground"
					aria-hidden="true"
				/>
			</div>
		);
	}

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
			<Button asChild variant="ghost" size="sm" className="w-fit">
				<Link href="/agents">
					<ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
					Agents
				</Link>
			</Button>
			<Card>
				<CardHeader>
					<CardTitle>{agent?.name ?? "Agent settings"}</CardTitle>
					<CardDescription>
						Choose the model and behavior needed before chatting.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={save}>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="agent-name">Name</FieldLabel>
								<FieldContent>
									<Input
										id="agent-name"
										required
										value={form.name}
										onChange={(event) =>
											setForm({ ...form, name: event.target.value })
										}
									/>
								</FieldContent>
							</Field>
							<Field>
								<FieldLabel htmlFor="agent-description">Description</FieldLabel>
								<FieldContent>
									<Input
										id="agent-description"
										value={form.description}
										onChange={(event) =>
											setForm({ ...form, description: event.target.value })
										}
									/>
								</FieldContent>
							</Field>
							<Field>
								<FieldLabel htmlFor="agent-provider">Provider</FieldLabel>
								<FieldContent>
									<select
										id="agent-provider"
										className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
										value={form.providerId}
										onChange={(event) =>
											setForm({
												...form,
												providerId: event.target.value,
												modelId: "",
											})
										}
									>
										<option value="">No provider</option>
										{providers.map((provider) => (
											<option key={provider.id} value={provider.id}>
												{provider.name}
											</option>
										))}
									</select>
								</FieldContent>
							</Field>
							<Field>
								<FieldLabel htmlFor="agent-model">Model</FieldLabel>
								<FieldContent>
									<select
										id="agent-model"
										className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
										value={form.modelId}
										onChange={(event) =>
											setForm({ ...form, modelId: event.target.value })
										}
										disabled={!form.providerId}
									>
										<option value="">No model</option>
										{filteredModels.map((model) => (
											<option key={model.id} value={model.id}>
												{model.displayName || model.modelId}
											</option>
										))}
									</select>
								</FieldContent>
							</Field>
							<Field>
								<FieldLabel htmlFor="agent-prompt">System prompt</FieldLabel>
								<FieldContent>
									<textarea
										id="agent-prompt"
										className="min-h-36 rounded-xl border border-border bg-background p-3 text-sm"
										value={form.systemPrompt}
										onChange={(event) =>
											setForm({ ...form, systemPrompt: event.target.value })
										}
										placeholder="Tell the agent how to behave."
									/>
								</FieldContent>
							</Field>
							<Field>
								<FieldLabel htmlFor="agent-sharing">Access</FieldLabel>
								<FieldContent>
									<select
										id="agent-sharing"
										className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
										value={form.sharingMode}
										onChange={(event) =>
											setForm({
												...form,
												sharingMode: event.target.value as Agent["sharingMode"],
											})
										}
									>
										<option value="personal">Personal</option>
										<option value="marketplace">Marketplace</option>
										<option value="specific_user">Specific user</option>
									</select>
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
											value={form.shareTargetEmail}
											onChange={(event) =>
												setForm({
													...form,
													shareTargetEmail: event.target.value,
												})
											}
											placeholder="teammate@company.com"
										/>
									</FieldContent>
								</Field>
							) : null}
							{agent?.canAdminCurate ? (
								<div className="rounded-xl border border-border/70 p-3">
									<div className="flex flex-col gap-3 text-sm">
										<label className="flex items-center gap-2">
											<input
												type="checkbox"
												checked={form.isGlobal}
												onChange={(event) =>
													setForm({ ...form, isGlobal: event.target.checked })
												}
											/>
											Global
										</label>
										<label className="flex items-center gap-2">
											<input
												type="checkbox"
												checked={form.isRecommended}
												onChange={(event) =>
													setForm({
														...form,
														isRecommended: event.target.checked,
													})
												}
											/>
											Recommended
										</label>
										<select
											className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
											value={form.curationLabel}
											onChange={(event) =>
												setForm({
													...form,
													curationLabel: event.target.value,
												})
											}
										>
											<option value="none">No label</option>
											<option value="recommended">Recommended</option>
											<option value="organization_created">
												Organization created
											</option>
										</select>
									</div>
								</div>
							) : null}
							<div className="grid gap-4 sm:grid-cols-2">
								<Field>
									<FieldLabel htmlFor="agent-temperature">
										Temperature
									</FieldLabel>
									<FieldContent>
										<Input
											id="agent-temperature"
											value={form.temperature}
											onChange={(event) =>
												setForm({ ...form, temperature: event.target.value })
											}
										/>
									</FieldContent>
								</Field>
								<Field>
									<FieldLabel htmlFor="agent-max-output">
										Max output tokens
									</FieldLabel>
									<FieldContent>
										<Input
											id="agent-max-output"
											type="number"
											min={1}
											value={form.maxOutputTokens}
											onChange={(event) =>
												setForm({
													...form,
													maxOutputTokens: event.target.value,
												})
											}
										/>
									</FieldContent>
								</Field>
							</div>
							<Button
								type="submit"
								disabled={
									saving ||
									(form.sharingMode === "specific_user" &&
										form.sharingMode !== form.originalSharingMode &&
										!form.shareTargetEmail.trim())
								}
							>
								{saving ? (
									<Spinner data-icon="inline-start" />
								) : (
									<SaveIcon data-icon="inline-start" aria-hidden="true" />
								)}
								Save agent
							</Button>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
