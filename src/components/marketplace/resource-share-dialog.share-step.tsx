"use client";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type ShareStep = "choose" | "meta" | "user";

export const STEP_INDEX: Record<ShareStep, number> = {
  choose: 1,
  meta: 2,
  user: 2,
};

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

export interface PlatformUser {
  id: string;
  name: string;
  email: string;
}

export function previewQueryParams(resource: ShareableResource, workspaceId: string) {
  const params = new URLSearchParams({ workspaceId });
  if (resource.kind === "marketplace_item") {
    params.set("itemId", resource.id);
  } else if (resource.kind === "agent") {
    params.set("agentId", resource.id);
  } else if (resource.kind === "skill") {
    params.set("skillId", resource.id);
  } else if (resource.kind === "custom_tool") {
    params.set("customToolId", resource.id);
  } else if (resource.kind === "mcp_server") {
    params.set("mcpServerId", resource.id);
  } else {
    params.set("mcpToolId", resource.id);
  }
  return params;
}

export function ShareOptionCard({ icon: Icon, title, description, onClick, disabled, loading }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string; onClick: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <button type="button" disabled={disabled || loading} onClick={onClick} className={cn("flex w-full items-start gap-3 rounded-xl border border-border/80 p-4 text-left transition-colors", "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", (disabled || loading) && "opacity-60 cursor-not-allowed")}>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">{loading ? <Spinner className="size-4" /> : <Icon className="size-5 text-muted-foreground" />}</div>
      <div className="min-w-0">
        <p className="font-medium text-sm">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}
