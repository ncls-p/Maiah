"use client";

import {
  BanIcon,
  CalendarRangeIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  DownloadIcon,
  FilterIcon,
  RotateCcwIcon,
  ShieldAlertIcon,
  UserIcon,
  XCircleIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

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
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/utils";

export interface AuditEvent {
  id: string;
  action: string;
  resourceType: string | null;
  outcome: string;
  actorPrincipalId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  createdAt: string;
}

type AuditOutcome = "success" | "failed" | "denied" | string;

export function outcomeMeta(outcome: AuditOutcome) {
  switch (outcome) {
    case "success":
      return {
        label: outcome,
        dot: "bg-success",
        ring: "ring-success/20",
        badge: "default" as const,
        icon: CheckCircle2Icon,
      };
    case "failed":
      return {
        label: outcome,
        dot: "bg-destructive",
        ring: "ring-destructive/20",
        badge: "destructive" as const,
        icon: XCircleIcon,
      };
    case "denied":
      return {
        label: outcome,
        dot: "bg-warning",
        ring: "ring-warning/20",
        badge: "outline" as const,
        icon: BanIcon,
      };
    default:
      return {
        label: outcome,
        dot: "bg-muted-foreground",
        ring: "ring-border",
        badge: "secondary" as const,
        icon: ShieldAlertIcon,
      };
  }
}

export function formatAction(action: string) {
  const [scope, verb] = action.split(".");
  if (!verb) return action;
  return { scope, verb };
}

export function AuditFilters({
  actionFilter,
  outcomeFilter,
  fromDate,
  toDate,
  busy,
  canExport,
  onActionChangeAction,
  onOutcomeChangeAction,
  onFromChangeAction,
  onToChangeAction,
  onApplyAction,
  onResetAction,
  onExportAction,
  t,
}: {
  actionFilter: string;
  outcomeFilter: string;
  fromDate: string;
  toDate: string;
  busy: boolean;
  canExport: boolean;
  onActionChangeAction: (value: string) => void;
  onOutcomeChangeAction: (value: string) => void;
  onFromChangeAction: (value: string) => void;
  onToChangeAction: (value: string) => void;
  onApplyAction: () => void;
  onResetAction: () => void;
  onExportAction: () => void;
  t: ReturnType<typeof useTranslations<"admin.audit">>;
}) {
  const hasFilters = Boolean(
    actionFilter.trim() || outcomeFilter !== "all" || fromDate || toDate,
  );

  return (
    <section className="rounded-2xl border bg-card p-4 sm:p-5 animate-in-fade stagger-2">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <FilterIcon
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
          {t("filters")}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!canExport || busy}
          onClick={onExportAction}
        >
          <DownloadIcon className="size-4" aria-hidden="true" />
          {t("exportCsv")}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_10rem_10rem_10rem_auto] lg:items-end">
        <div className="grid gap-2">
          <Label htmlFor="audit-action-filter">{t("actionFilter")}</Label>
          <Input
            id="audit-action-filter"
            autoComplete="off"
            placeholder={t("actionPlaceholder")}
            value={actionFilter}
            onChange={(e) => onActionChangeAction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onApplyAction();
            }}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="audit-outcome">{t("outcome")}</Label>
          <Select value={outcomeFilter} onValueChange={onOutcomeChangeAction}>
            <SelectTrigger id="audit-outcome">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("outcomeAll")}</SelectItem>
              <SelectItem value="success">{t("outcomeSuccess")}</SelectItem>
              <SelectItem value="failed">{t("outcomeFailed")}</SelectItem>
              <SelectItem value="denied">{t("outcomeDenied")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="audit-from">{t("from")}</Label>
          <div className="relative">
            <CalendarRangeIcon
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="audit-from"
              type="date"
              className="pl-9"
              value={fromDate}
              onChange={(e) => onFromChangeAction(e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="audit-to">{t("to")}</Label>
          <div className="relative">
            <CalendarRangeIcon
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="audit-to"
              type="date"
              className="pl-9"
              value={toDate}
              onChange={(e) => onToChangeAction(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button
            variant="outline"
            disabled={!hasFilters || busy}
            onClick={onResetAction}
          >
            <RotateCcwIcon className="size-4" aria-hidden="true" />
            {t("resetFilter")}
          </Button>
          <Button disabled={busy} onClick={onApplyAction}>
            {t("applyFilter")}
          </Button>
        </div>
      </div>
    </section>
  );
}
