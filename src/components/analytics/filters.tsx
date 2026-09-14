"use client";
import { useTranslations } from "next-intl";
import { GovernanceSelect } from "@/components/iam/governance-select";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "./filter-select";
import type { AnalyticsKind, AnalyticsScope } from "@/modules/analytics/query";
import type { Facets } from "@/modules/analytics/types";
export type FilterValues = Record<string, string>;
export function defaultFilters(): FilterValues {
  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 30);
  return {
    from: start.toISOString().slice(0, 16),
    to: now.toISOString().slice(0, 16),
    groupBy: "provider",
    bucket: "day",
  };
}
export function AnalyticsFilters({
  kind,
  scopes,
  scope,
  onScope,
  values,
  onChange,
  onApply,
  onReset,
  facets,
  busy,
}: {
  kind: AnalyticsKind;
  scopes: AnalyticsScope[];
  scope: AnalyticsScope;
  onScope: (value: string) => void;
  values: FilterValues;
  onChange: (values: FilterValues) => void;
  onApply: () => void;
  onReset: () => void;
  facets: Facets;
  busy: boolean;
}) {
  const t = useTranslations("analytics");
  const set = (key: string, value: string) =>
    onChange({ ...values, [key]: value });
  const invalid = Boolean(values.from && values.to && values.from > values.to);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!invalid) onApply();
      }}
      className="flex flex-col gap-4 rounded-2xl border bg-card p-5"
    >
      <FieldGroup className="grid gap-4 md:grid-cols-3">
        <GovernanceSelect
          label={t("scope")}
          value={scope.id}
          onChange={onScope}
          options={scopes.map((item) => ({
            id: item.id,
            name:
              item.type === "application"
                ? t("application")
                : `${t(item.type)} · ${item.name} · ${item.id.slice(0, 6)}`,
          }))}
        />
        {(["from", "to"] as const).map((key) => (
          <Field key={key} data-invalid={invalid}>
            <FieldLabel htmlFor={`analytics-${key}`}>{t(key)} (UTC)</FieldLabel>
            <Input
              id={`analytics-${key}`}
              type="datetime-local"
              value={values[key] ?? ""}
              aria-invalid={invalid}
              onChange={(event) => set(key, event.target.value)}
            />
          </Field>
        ))}
      </FieldGroup>
      {invalid && (
        <p role="alert" className="text-sm text-destructive">
          {t("invalidDates")}
        </p>
      )}
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          {t("advanced")}
          {Object.entries(values).filter(
            ([key, value]) =>
              value && !["from", "to", "groupBy", "bucket"].includes(key),
          ).length
            ? ` · ${t("filtersActive")}`
            : ""}
        </summary>
        <FieldGroup className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Object.entries(facets)
            .filter(([key]) => key.endsWith("Ids"))
            .map(([key, options]) => (
              <FilterSelect
                key={key}
                label={t(key)}
                options={options}
                value={values[key] ?? ""}
                onChange={(value) => set(key, value)}
              />
            ))}
          {(kind === "usage"
            ? ["operation", "status", "conversationId"]
            : ["action", "resourceType", "resourceId"]
          ).map((key) => (
            <Field key={key}>
              <FieldLabel htmlFor={`filter-${key}`}>{t(key)}</FieldLabel>
              <Input
                id={`filter-${key}`}
                list={`suggestions-${key}`}
                value={values[key] ?? ""}
                onChange={(event) => set(key, event.target.value)}
              />
              <datalist id={`suggestions-${key}`}>
                {(facets[key] ?? []).map((option) => (
                  <option key={option.id} value={option.id} />
                ))}
              </datalist>
            </Field>
          ))}
          {kind === "audit" && (
            <GovernanceSelect
              label={t("outcome")}
              value={values.outcome || "all"}
              onChange={(value) => set("outcome", value === "all" ? "" : value)}
              options={["all", "success", "failed", "denied"].map((id) => ({
                id,
                name: t(id),
              }))}
            />
          )}
        </FieldGroup>
        <p className="mt-3 text-xs text-muted-foreground">{t("teamHint")}</p>
      </details>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy || invalid} type="submit">
          {t("apply")}
        </Button>
        <Button type="button" variant="ghost" onClick={onReset}>
          {t("reset")}
        </Button>
        <span className="text-xs text-muted-foreground">{t("filterHint")}</span>
      </div>
    </form>
  );
}
