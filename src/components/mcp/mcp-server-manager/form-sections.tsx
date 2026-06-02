import { ChevronDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { McpServerForm } from "./form";
import type { SimpleAuthMode } from "./types";

export function AuthSection({
	form,
	setForm,
	transport,
	prefix,
}: {
	form: McpServerForm;
	setForm: (f: McpServerForm) => void;
	transport: string;
	prefix: string;
}) {
	return (
		<div className="grid min-w-0 gap-3 rounded-lg border border-border/70 bg-background/70 p-3">
			<div className="grid min-w-0 gap-2">
				<Label htmlFor={`${prefix}-auth-mode`}>Authentication</Label>
				<Select
					value={form.authMode}
					onValueChange={(value) =>
						setForm({ ...form, authMode: value as SimpleAuthMode })
					}
				>
					<SelectTrigger id={`${prefix}-auth-mode`} className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="none">No auth</SelectItem>
						{transport === "stdio" ? (
							<SelectItem value="env">API key / token</SelectItem>
						) : (
							<>
								<SelectItem value="bearer">Bearer token</SelectItem>
								<SelectItem value="api-key">API key header</SelectItem>
							</>
						)}
					</SelectContent>
				</Select>
			</div>
			{transport === "stdio" && form.authMode === "env" ? (
				<div className="grid gap-3 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]">
					<div className="grid gap-2">
						<Label htmlFor={`${prefix}-env-key-name`}>Variable name</Label>
						<Input
							id={`${prefix}-env-key-name`}
							autoComplete="off"
							value={form.envKeyName}
							onChange={(e) => setForm({ ...form, envKeyName: e.target.value })}
							placeholder="API_KEY"
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor={`${prefix}-env-key-value`}>Secret value</Label>
						<Input
							id={`${prefix}-env-key-value`}
							type="password"
							autoComplete="off"
							value={form.envKeyValue}
							onChange={(e) =>
								setForm({ ...form, envKeyValue: e.target.value })
							}
							placeholder="Paste token…"
						/>
					</div>
				</div>
			) : null}
			{transport !== "stdio" && form.authMode === "bearer" ? (
				<div className="grid gap-2">
					<Label htmlFor={`${prefix}-bearer-token`}>Bearer token</Label>
					<Input
						id={`${prefix}-bearer-token`}
						type="password"
						autoComplete="off"
						value={form.bearerToken}
						onChange={(e) => setForm({ ...form, bearerToken: e.target.value })}
						placeholder="Paste token…"
					/>
				</div>
			) : null}
			{transport !== "stdio" && form.authMode === "api-key" ? (
				<div className="grid gap-3 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]">
					<div className="grid gap-2">
						<Label htmlFor={`${prefix}-api-key-header`}>Header name</Label>
						<Input
							id={`${prefix}-api-key-header`}
							autoComplete="off"
							value={form.apiKeyHeader}
							onChange={(e) =>
								setForm({ ...form, apiKeyHeader: e.target.value })
							}
							placeholder="X-API-Key"
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor={`${prefix}-api-key-value`}>API key</Label>
						<Input
							id={`${prefix}-api-key-value`}
							type="password"
							autoComplete="off"
							value={form.apiKeyValue}
							onChange={(e) =>
								setForm({ ...form, apiKeyValue: e.target.value })
							}
							placeholder="Paste key…"
						/>
					</div>
				</div>
			) : null}
		</div>
	);
}

export function AdvancedSection({
	open,
	onOpenChange,
	form,
	setForm,
	prefix,
	placeholder,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	form: McpServerForm;
	setForm: (f: McpServerForm) => void;
	prefix: string;
	placeholder: string;
}) {
	return (
		<Collapsible
			open={open}
			onOpenChange={onOpenChange}
			className="min-w-0 overflow-hidden rounded-lg border border-border/70 bg-muted/20"
		>
			<CollapsibleTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					className="flex w-full justify-between px-3 py-2 text-sm"
				>
					<span>Advanced options</span>
					<ChevronDownIcon
						className={cn("size-4 transition-transform", open && "rotate-180")}
						aria-hidden="true"
					/>
				</Button>
			</CollapsibleTrigger>
			<CollapsibleContent className="grid min-w-0 gap-4 border-t border-border/60 p-3">
				<p className="text-xs text-muted-foreground">{placeholder}</p>
				<div className="grid gap-2">
					<Label htmlFor={`${prefix}-headers`}>HTTP headers</Label>
					<Textarea
						id={`${prefix}-headers`}
						autoComplete="off"
						value={form.headers}
						onChange={(e) => setForm({ ...form, headers: e.target.value })}
						placeholder="Authorization=Bearer sk-…"
					/>
					<p className="text-xs text-muted-foreground">
						One header per line as <code>Key=Value</code>.
					</p>
				</div>
				<div className="grid gap-2">
					<Label htmlFor={`${prefix}-env`}>Environment variables</Label>
					<Textarea
						id={`${prefix}-env`}
						autoComplete="off"
						value={form.env}
						onChange={(e) => setForm({ ...form, env: e.target.value })}
						placeholder="API_KEY=…"
					/>
					<p className="text-xs text-muted-foreground">
						One variable per line as <code>KEY=VALUE</code>.
					</p>
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
