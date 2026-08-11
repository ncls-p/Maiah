"use client";

import type {
  AgentAccessOptions,
  AgentAccessScope,
} from "@/modules/agent/access-scope";
import {
  Building2Icon,
  FolderIcon,
  LockKeyholeIcon,
  UsersIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const SCOPE_ICONS = {
  private: LockKeyholeIcon,
  project: FolderIcon,
  organization: Building2Icon,
  team: UsersIcon,
} as const;

export function ResourceAccessScopePicker({
  value,
  teamId,
  options,
  disabled,
  copyNamespace = "agents.accessScope",
  onChangeAction,
}: {
  value: AgentAccessScope;
  teamId: string;
  options: AgentAccessOptions;
  disabled?: boolean;
  copyNamespace?: "agents.accessScope" | "resourceAccessScope";
  onChangeAction: (scope: AgentAccessScope, teamId?: string) => void;
}) {
  const t = useTranslations(copyNamespace);
  return (
    <div className="space-y-3" data-slot="agent-access-scope-picker">
      <div>
        <Label>{t("label")}</Label>
        <p className="mt-1 text-xs text-muted-foreground">{t("hint")}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.scopes.map((scope) => {
          const Icon = SCOPE_ICONS[scope];
          const selected = value === scope;
          return (
            <button
              key={scope}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              className={cn(
                "flex min-w-0 items-start gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60",
                selected && "border-primary/50 bg-primary/5",
              )}
              onClick={() =>
                onChangeAction(scope, scope === "team" ? teamId : undefined)
              }
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {t(`${scope}.title`)}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  {t(`${scope}.description`, {
                    project: options.projectName,
                    organization: options.organizationName,
                  })}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {value === "team" ? (
        <div className="space-y-2">
          <Label htmlFor="agent-access-team">{t("team.select")}</Label>
          <Select
            value={teamId}
            disabled={disabled}
            onValueChange={(nextTeamId) => onChangeAction("team", nextTeamId)}
          >
            <SelectTrigger id="agent-access-team" className="w-full">
              <SelectValue placeholder={t("team.placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {options.teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {options.teams.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("team.empty")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export const AgentAccessScopePicker = ResourceAccessScopePicker;
