import { CalendarRangeIcon, FilterIcon, RotateCcwIcon } from "lucide-react";
import type { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type T = ReturnType<typeof useTranslations<"admin.usage">>;

export function UsageFilters(props: {
  operationFilter: string;
  fromDate: string;
  toDate: string;
  busy: boolean;
  onOperationChangeAction: (value: string) => void;
  onFromChangeAction: (value: string) => void;
  onToChangeAction: (value: string) => void;
  onApplyAction: () => void;
  onResetAction: () => void;
  t: T;
}) {
  const hasFilters = Boolean(
    props.operationFilter.trim() || props.fromDate || props.toDate,
  );
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-[var(--surface-shadow)] sm:p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-medium">
        <FilterIcon
          className="size-4 text-muted-foreground"
          aria-hidden="true"
        />
        {props.t("filters")}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_10rem_10rem_auto] lg:items-end">
        <div className="grid gap-2">
          <Label htmlFor="usage-operation-filter">
            {props.t("operationFilter")}
          </Label>
          <Input
            id="usage-operation-filter"
            placeholder={props.t("operationPlaceholder")}
            value={props.operationFilter}
            onChange={(event) =>
              props.onOperationChangeAction(event.target.value)
            }
            onKeyDown={(event) =>
              event.key === "Enter" && props.onApplyAction()
            }
          />
        </div>
        <DateFilter
          id="usage-from"
          label={props.t("from")}
          value={props.fromDate}
          onChange={props.onFromChangeAction}
        />
        <DateFilter
          id="usage-to"
          label={props.t("to")}
          value={props.toDate}
          onChange={props.onToChangeAction}
        />
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button
            variant="outline"
            disabled={!hasFilters || props.busy}
            onClick={props.onResetAction}
          >
            <RotateCcwIcon className="size-4" aria-hidden="true" />
            {props.t("resetFilter")}
          </Button>
          <Button disabled={props.busy} onClick={props.onApplyAction}>
            {props.t("applyFilter")}
          </Button>
        </div>
      </div>
    </section>
  );
}

function DateFilter(props: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      <div className="relative">
        <CalendarRangeIcon
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id={props.id}
          type="date"
          className="pl-9"
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
      </div>
    </div>
  );
}
