import {
	MoreHorizontalIcon,
	PlusIcon,
	RefreshCwIcon,
	SearchIcon,
	Trash2Icon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { KIND_LABELS, kindAccent } from "./constants";
import {
	HealthIndicator,
	ProviderCardSkeleton,
	ProviderTypeIcon,
} from "./provider-shared";
import type { SafeProvider } from "./types";

type ProviderListProps = {
	providers: SafeProvider[];
	filteredProviders: SafeProvider[];
	selectedProviderId: string | null;
	providerSearch: string;
	loadingProviders: boolean;
	busy: boolean;
	onSearchChange: (value: string) => void;
	onAddProvider: () => void;
	onSelectProvider: (providerId: string) => void;
	onToggleProvider: (provider: SafeProvider) => void;
	onTestProvider: (providerId: string) => void;
	onEditProvider: (provider: SafeProvider) => void;
	onDeleteProvider: (providerId: string) => void;
};

export function ProviderList(props: ProviderListProps) {
	return (
		<section className="rounded-xl border bg-card">
			<ProviderListHeader {...props} />
			<ProviderListBody {...props} />
		</section>
	);
}

function ProviderListHeader({
	providers,
	providerSearch,
	onSearchChange,
}: ProviderListProps) {
	return (
		<div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<h3 className="text-base font-semibold">Connections</h3>
				<p className="text-sm text-muted-foreground">
					{providers.length} provider{providers.length !== 1 ? "s" : ""}{" "}
					configured
				</p>
			</div>
			{providers.length > 2 ? (
				<div className="relative w-56 sm:w-64">
					<SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Filter…"
						value={providerSearch}
						onChange={(e) => onSearchChange(e.target.value)}
						className="h-8 pl-9 text-sm"
					/>
				</div>
			) : null}
		</div>
	);
}

function ProviderListBody(props: ProviderListProps) {
	const { loadingProviders, filteredProviders, providers, providerSearch } =
		props;

	if (loadingProviders) {
		return (
			<div className="space-y-1 p-2">
				<ProviderCardSkeleton />
				<ProviderCardSkeleton />
			</div>
		);
	}

	if (filteredProviders.length === 0 && providers.length === 0) {
		return <EmptyProviders onAddProvider={props.onAddProvider} />;
	}

	if (filteredProviders.length === 0) {
		return (
			<div className="px-5 py-8 text-center text-sm text-muted-foreground">
				No provider matches &ldquo;{providerSearch}&rdquo;.
			</div>
		);
	}

	return (
		<div className="divide-y">
			{filteredProviders.map((provider) => (
				<ProviderRow key={provider.id} provider={provider} {...props} />
			))}
		</div>
	);
}

function EmptyProviders({ onAddProvider }: { onAddProvider: () => void }) {
	return (
		<div className="px-5 py-12 text-center">
			<p className="text-sm font-medium">No connections yet</p>
			<p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
				Add your first provider to make models available to your assistants.
			</p>
			<Button size="sm" className="mt-4" onClick={onAddProvider}>
				<PlusIcon className="size-4" aria-hidden="true" />
				Add first provider
			</Button>
		</div>
	);
}

function ProviderRow({
	provider,
	selectedProviderId,
	busy,
	onSelectProvider,
	onToggleProvider,
	onTestProvider,
	onEditProvider,
	onDeleteProvider,
}: ProviderListProps & { provider: SafeProvider }) {
	const colors = kindAccent(provider.kind);
	const isSelected = selectedProviderId === provider.id;

	function selectOnKeyboard(event: React.KeyboardEvent<HTMLDivElement>) {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			onSelectProvider(provider.id);
		}
	}

	return (
		<div
			role="button"
			tabIndex={0}
			onClick={() => onSelectProvider(provider.id)}
			onKeyDown={selectOnKeyboard}
			className={cn(
				"group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none",
				isSelected ? "bg-muted/50" : "",
			)}
		>
			<div
				className={cn(
					"hidden h-8 w-1 shrink-0 rounded-full sm:block",
					colors.bar,
				)}
			/>
			<ProviderTypeIcon kind={provider.kind} />
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<p className="truncate text-sm font-medium">{provider.name}</p>
					{isSelected ? (
						<Badge variant="secondary" className="text-xs">
							Active
						</Badge>
					) : null}
				</div>
				<p className="truncate font-mono text-xs text-muted-foreground">
					{provider.baseUrl || "default endpoint"}
				</p>
			</div>
			<span className="hidden text-xs text-muted-foreground sm:inline">
				{KIND_LABELS[provider.kind]}
			</span>
			<HealthIndicator
				status={provider.healthStatus}
				lastChecked={provider.lastCheckedAt}
			/>
			<div className="shrink-0" onClick={(e) => e.stopPropagation()}>
				<Switch
					checked={provider.enabled}
					onCheckedChange={() => onToggleProvider(provider)}
					size="sm"
					aria-label={provider.enabled ? "Disable provider" : "Enable provider"}
				/>
			</div>
			<ProviderActions
				busy={busy}
				provider={provider}
				onEditProvider={onEditProvider}
				onTestProvider={onTestProvider}
				onDeleteProvider={onDeleteProvider}
			/>
		</div>
	);
}

function ProviderActions({
	busy,
	provider,
	onEditProvider,
	onTestProvider,
	onDeleteProvider,
}: Pick<
	ProviderListProps,
	"busy" | "onEditProvider" | "onTestProvider" | "onDeleteProvider"
> & { provider: SafeProvider }) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					size="icon-sm"
					variant="ghost"
					className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
					onClick={(e) => e.stopPropagation()}
					aria-label="Provider actions"
				>
					<MoreHorizontalIcon className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={() => onEditProvider(provider)}>
					Edit connection
				</DropdownMenuItem>
				<DropdownMenuItem
					disabled={busy}
					onClick={() => onTestProvider(provider.id)}
				>
					<RefreshCwIcon className="size-4" />
					Test connection
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					variant="destructive"
					onClick={() => onDeleteProvider(provider.id)}
				>
					<Trash2Icon className="size-4" />
					Archive provider
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
