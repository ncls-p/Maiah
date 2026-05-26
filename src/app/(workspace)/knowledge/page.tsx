"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpenIcon, Loader2, PlusIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";
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
import { Badge } from "@/components/ui/badge";

interface KnowledgeBase {
	id: string;
	name: string;
	description: string | null;
	createdAt: string;
}
interface DocumentRow {
	id: string;
	title: string;
	status: string;
	createdAt: string;
}
interface SearchResult {
	chunkId: string;
	documentTitle: string;
	content: string;
	score: number;
}

function getBrowserWorkspaceId() {
	return typeof window === "undefined"
		? null
		: window.sessionStorage.getItem("active_workspace_id");
}

export default function KnowledgePage() {
	const [workspaceId, setWorkspaceId] = useState<string | null>(() =>
		getBrowserWorkspaceId(),
	);
	const [bases, setBases] = useState<KnowledgeBase[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [documents, setDocuments] = useState<DocumentRow[]>([]);
	const [results, setResults] = useState<SearchResult[]>([]);
	const [loading, setLoading] = useState(true);
	const [baseForm, setBaseForm] = useState({ name: "", description: "" });
	const [docForm, setDocForm] = useState({ title: "", content: "" });
	const [query, setQuery] = useState("");

	useEffect(() => {
		if (workspaceId) return;
		let cancelled = false;
		async function loadWorkspace() {
			const res = await fetch("/api/workspaces");
			const data = await res.json();
			if (cancelled || !Array.isArray(data)) return;
			const id = data[0]?.workspace?.id || data[0]?.id;
			if (id) {
				setWorkspaceId(id);
				window.sessionStorage.setItem("active_workspace_id", id);
			}
		}
		void loadWorkspace().catch(() => toast.error("Unable to load workspace"));
		return () => {
			cancelled = true;
		};
	}, [workspaceId]);

	const loadBases = useCallback(async () => {
		if (!workspaceId) return;
		const res = await fetch(
			`/api/workspace/knowledge-bases?workspaceId=${workspaceId}`,
		);
		if (!res.ok) throw new Error("Failed to load knowledge bases");
		const data = (await res.json()) as KnowledgeBase[];
		setBases(data);
		setSelectedId((current) =>
			current && data.some((base) => base.id === current)
				? current
				: (data[0]?.id ?? null),
		);
	}, [workspaceId]);

	useEffect(() => {
		if (!workspaceId) return;
		let cancelled = false;
		async function run() {
			try {
				await loadBases();
			} catch (error) {
				if (!cancelled)
					toast.error(
						error instanceof Error ? error.message : "Failed to load",
					);
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		void run();
		return () => {
			cancelled = true;
		};
	}, [loadBases, workspaceId]);

	useEffect(() => {
		if (!workspaceId || !selectedId) {
			queueMicrotask(() => setDocuments([]));
			return;
		}
		let cancelled = false;
		async function run() {
			const res = await fetch(
				`/api/workspace/knowledge-bases/${selectedId}/documents?workspaceId=${workspaceId}`,
			);
			if (!res.ok) throw new Error("Failed to load documents");
			if (!cancelled) setDocuments(await res.json());
		}
		void run().catch(
			(error) =>
				!cancelled &&
				toast.error(
					error instanceof Error ? error.message : "Failed to load documents",
				),
		);
		return () => {
			cancelled = true;
		};
	}, [workspaceId, selectedId]);

	async function createBase() {
		if (!workspaceId || !baseForm.name.trim()) return;
		const res = await fetch("/api/workspace/knowledge-bases", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				workspaceId,
				name: baseForm.name.trim(),
				description: baseForm.description.trim() || undefined,
			}),
		});
		if (!res.ok) return toast.error("Failed to create knowledge base");
		setBaseForm({ name: "", description: "" });
		await loadBases();
		toast.success("Knowledge base created");
	}

	async function ingestDocument() {
		if (
			!workspaceId ||
			!selectedId ||
			!docForm.title.trim() ||
			!docForm.content.trim()
		)
			return;
		const res = await fetch(
			`/api/workspace/knowledge-bases/${selectedId}/documents`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					workspaceId,
					title: docForm.title.trim(),
					content: docForm.content,
				}),
			},
		);
		if (!res.ok) return toast.error("Failed to ingest document");
		setDocForm({ title: "", content: "" });
		const docs = await fetch(
			`/api/workspace/knowledge-bases/${selectedId}/documents?workspaceId=${workspaceId}`,
		);
		if (docs.ok) setDocuments(await docs.json());
		toast.success("Document indexed");
	}

	async function search() {
		if (!workspaceId || !selectedId || !query.trim()) return;
		const res = await fetch(
			`/api/workspace/knowledge-bases/${selectedId}/search`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workspaceId, query }),
			},
		);
		if (!res.ok) return toast.error("Search failed");
		setResults(await res.json());
	}

	return (
		<div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-[20rem_1fr]">
			<section className="flex flex-col gap-4">
				<div>
					<div className="section-kicker">Knowledge</div>
					<h1 className="text-2xl font-semibold">Knowledge bases</h1>
					<p className="text-sm text-muted-foreground">
						Encrypted chunks, workspace isolation, and citation-ready retrieval.
					</p>
				</div>
				<Card>
					<CardHeader>
						<CardTitle>Create base</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-3">
						<Label>Name</Label>
						<Input
							value={baseForm.name}
							onChange={(e) =>
								setBaseForm({ ...baseForm, name: e.target.value })
							}
						/>
						<Label>Description</Label>
						<Input
							value={baseForm.description}
							onChange={(e) =>
								setBaseForm({ ...baseForm, description: e.target.value })
							}
						/>
						<Button onClick={createBase}>
							<PlusIcon data-icon="inline-start" />
							Create
						</Button>
					</CardContent>
				</Card>
				{loading ? (
					<Loader2 className="animate-spin" />
				) : (
					bases.map((base) => (
						<button
							key={base.id}
							type="button"
							onClick={() => setSelectedId(base.id)}
							className={`rounded-xl border p-3 text-left text-sm ${selectedId === base.id ? "border-primary bg-primary/5" : "border-border"}`}
						>
							<span className="font-medium">{base.name}</span>
							{base.description ? (
								<p className="text-muted-foreground">{base.description}</p>
							) : null}
						</button>
					))
				)}
			</section>
			<section className="flex flex-col gap-4">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<BookOpenIcon className="size-5" />
							Documents
						</CardTitle>
						<CardDescription>
							Paste text to index it immediately. A worker can replace this
							synchronous path later.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-3">
						<Input
							placeholder="Document title"
							value={docForm.title}
							onChange={(e) =>
								setDocForm({ ...docForm, title: e.target.value })
							}
						/>
						<textarea
							className="min-h-40 rounded-xl border bg-background p-3 text-sm"
							placeholder="Document content"
							value={docForm.content}
							onChange={(e) =>
								setDocForm({ ...docForm, content: e.target.value })
							}
						/>
						<Button onClick={ingestDocument} disabled={!selectedId}>
							Ingest document
						</Button>
					</CardContent>
				</Card>
				<div className="grid gap-2">
					{documents.map((doc) => (
						<Card key={doc.id}>
							<CardContent className="flex items-center justify-between p-4">
								<span className="font-medium">{doc.title}</span>
								<Badge variant="outline">{doc.status}</Badge>
							</CardContent>
						</Card>
					))}
				</div>
				<Card>
					<CardHeader>
						<CardTitle>Search</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-3">
						<div className="flex gap-2">
							<Input
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Search indexed text"
							/>
							<Button onClick={search}>
								<SearchIcon data-icon="inline-start" />
								Search
							</Button>
						</div>
						{results.map((result) => (
							<div
								key={result.chunkId}
								className="rounded-xl border p-3 text-sm"
							>
								<p className="font-medium">{result.documentTitle}</p>
								<p className="mt-1 line-clamp-4 text-muted-foreground">
									{result.content}
								</p>
							</div>
						))}
					</CardContent>
				</Card>
			</section>
		</div>
	);
}
