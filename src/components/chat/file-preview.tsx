"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyIcon, DownloadIcon } from "lucide-react";

interface FilePreviewOptions {
	attachmentId: string;
	canPreview: boolean;
}

async function requestPreviewText(attachmentId: string) {
	const response = await fetch(
		`/api/workspace/chat-attachments/${attachmentId}/extracted`,
	);
	const data = (await response.json().catch(() => null)) as {
		text?: string;
		error?: string;
	} | null;
	if (!response.ok) {
		throw new Error(data?.error || "Failed to load extracted file text");
	}
	return data?.text ?? "";
}

export function useFilePreview(options: FilePreviewOptions) {
	const { attachmentId, canPreview } = options;
	const [previewOpen, setPreviewOpen] = useState(false);
	const [previewText, setPreviewText] = useState<string | null>(null);
	const [previewError, setPreviewError] = useState<string | null>(null);
	const [loadingPreview, setLoadingPreview] = useState(false);

	async function loadPreviewText() {
		if (!canPreview || previewText !== null || loadingPreview) return;
		setLoadingPreview(true);
		setPreviewError(null);
		try {
			setPreviewText(await requestPreviewText(attachmentId));
		} catch (error) {
			setPreviewError(
				error instanceof Error
					? error.message
					: "Failed to load extracted file text",
			);
		} finally {
			setLoadingPreview(false);
		}
	}

	function openPreview() {
		setPreviewOpen(true);
		void loadPreviewText();
	}

	function closePreview() {
		setPreviewOpen(false);
	}

	return {
		previewOpen,
		previewText,
		previewError,
		loadingPreview,
		openPreview,
		closePreview,
		setPreviewOpen,
	};
}

interface FilePreviewDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	fileName: string;
	url: string;
	subtitle: ReactNode;
	previewText: string | null;
	previewError: string | null;
	loadingPreview: boolean;
}

export function FilePreviewDialog({
	open,
	onOpenChange,
	fileName,
	url,
	subtitle,
	previewText,
	previewError,
	loadingPreview,
}: FilePreviewDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[85dvh] max-w-3xl flex-col overflow-hidden">
				<div className="flex min-w-0 items-start justify-between gap-3 border-b pb-3">
					<div className="min-w-0">
						<DialogTitle className="truncate text-base">{fileName}</DialogTitle>
						<p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
					</div>
					<div className="flex shrink-0 items-center gap-1 pr-8">
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-8 gap-1.5 px-2 text-xs"
							disabled={!previewText}
							onClick={() => {
								if (!previewText) return;
								void navigator.clipboard.writeText(previewText);
							}}
						>
							<CopyIcon className="size-3" aria-hidden="true" />
							Copy
						</Button>
						<Button
							asChild
							variant="ghost"
							size="sm"
							className="h-8 gap-1.5 px-2 text-xs"
						>
							<a href={url} target="_blank" rel="noreferrer">
								<DownloadIcon className="size-3" aria-hidden="true" />
								Download
							</a>
						</Button>
					</div>
				</div>
				<div className="min-h-0 flex-1 overflow-auto px-1 py-4">
					{loadingPreview ? (
						<Skeleton className="h-64 w-full rounded-xl" />
					) : previewError ? (
						<p className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
							{previewError}
						</p>
					) : (
						<pre className="min-h-0 flex-1 overflow-auto rounded-xl border bg-muted/20 p-3 whitespace-pre-wrap font-mono text-xs leading-5 text-foreground">
							{previewText || "No extracted text available."}
						</pre>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
