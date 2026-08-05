"use client";

import { useLocale, useTranslations } from "next-intl";

import { Skeleton } from "@/components/ui/skeleton";

import { UsageBreakdowns } from "./usage-breakdowns";
import { UsageEvents } from "./usage-events";
import { UsageFilters } from "./usage-filters";
import { UsageSummary } from "./usage-summary";
import { UsageTrend } from "./usage-trend";
import type { UsageResponse } from "./usage-types";

export type { UsageResponse } from "./usage-types";

export function UsageDashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-36 rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="h-72 rounded-2xl" />
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );
}

export function UsageDashboard(props: {
  data: UsageResponse;
  busy: boolean;
  operationFilter: string;
  fromDate: string;
  toDate: string;
  onOperationChangeAction: (value: string) => void;
  onFromChangeAction: (value: string) => void;
  onToChangeAction: (value: string) => void;
  onApplyAction: () => void;
  onResetAction: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations("admin.usage");
  return (
    <div className="flex flex-col gap-6" aria-busy={props.busy}>
      <UsageSummary data={props.data} locale={locale} t={t} />
      <UsageFilters {...props} t={t} />
      <UsageTrend daily={props.data.daily} locale={locale} t={t} />
      <UsageBreakdowns data={props.data} locale={locale} t={t} />
      <UsageEvents events={props.data.events} t={t} />
    </div>
  );
}
