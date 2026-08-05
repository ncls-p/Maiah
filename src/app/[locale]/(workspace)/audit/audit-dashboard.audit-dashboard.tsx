"use client";

import {
BanIcon,
CheckCircle2Icon,
ClipboardListIcon,
XCircleIcon
} from "lucide-react";
import { useLocale,useTranslations } from "next-intl";

import { StatCard } from "@/components/ui/stat-card";
import { AuditEvent,AuditFilters } from "./audit-dashboard.audit-event";
import { AuditEventRow,computeStats } from "./audit-dashboard.audit-event-row";


export function AuditDashboard({
  events,
  busy,
  actionFilter,
  outcomeFilter,
  fromDate,
  toDate,
  onActionChangeAction,
  onOutcomeChangeAction,
  onFromChangeAction,
  onToChangeAction,
  onApplyAction,
  onResetAction,
  onExportAction,
}: {
  events: AuditEvent[];
  busy: boolean;
  actionFilter: string;
  outcomeFilter: string;
  fromDate: string;
  toDate: string;
  onActionChangeAction: (value: string) => void;
  onOutcomeChangeAction: (value: string) => void;
  onFromChangeAction: (value: string) => void;
  onToChangeAction: (value: string) => void;
  onApplyAction: () => void;
  onResetAction: () => void;
  onExportAction: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations("admin.audit");
  const stats = computeStats(events);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 animate-in-up stagger-1">
        <StatCard
          label={t("totalEvents")}
          value={stats.total}
          icon={ClipboardListIcon}
          color="bg-primary/10 text-primary"
          accent="bg-primary"
        />
        <StatCard
          label={t("outcomeSuccess")}
          value={stats.success}
          icon={CheckCircle2Icon}
          color="bg-success/10 text-success"
          accent="bg-success"
        />
        <StatCard
          label={t("outcomeFailed")}
          value={stats.failed}
          icon={XCircleIcon}
          color="bg-destructive/10 text-destructive"
          accent="bg-destructive"
        />
        <StatCard
          label={t("outcomeDenied")}
          value={stats.denied}
          icon={BanIcon}
          color="bg-warning/10 text-warning"
          accent="bg-warning"
        />
      </div>

      <AuditFilters
        actionFilter={actionFilter}
        outcomeFilter={outcomeFilter}
        fromDate={fromDate}
        toDate={toDate}
        busy={busy}
        canExport={events.length > 0}
        onActionChangeAction={onActionChangeAction}
        onOutcomeChangeAction={onOutcomeChangeAction}
        onFromChangeAction={onFromChangeAction}
        onToChangeAction={onToChangeAction}
        onApplyAction={onApplyAction}
        onResetAction={onResetAction}
        onExportAction={onExportAction}
        t={t}
      />

      <section className="rounded-2xl border bg-card p-5 animate-in-fade stagger-3">
        <div className="mb-5 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <ClipboardListIcon
              className="size-4 text-primary"
              aria-hidden="true"
            />
            <h2 className="text-base font-semibold">{t("recentEvents")}</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("recentEventsDescription")}
          </p>
        </div>

        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-12 text-center">
            <ClipboardListIcon
              className="size-8 text-muted-foreground/60"
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-foreground">
              {t("emptyTitle")}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {t("emptyDescription")}
            </p>
          </div>
        ) : (
          <div className="max-h-[40rem] overflow-y-auto pr-1">
            {events.map((event, index) => (
              <AuditEventRow
                key={event.id}
                event={event}
                isLast={index === events.length - 1}
                locale={locale}
                t={t}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
