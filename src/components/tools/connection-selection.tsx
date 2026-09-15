"use client";

import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import type { ExecutionConnection } from "@/modules/tool-connections/connection-selection";

export function ConnectionSelection({
  connections,
  selectedIds,
  onChange,
  allowDefault = false,
}: {
  connections: ExecutionConnection[];
  selectedIds?: string[] | null;
  onChange: (ids: string[] | null) => void;
  allowDefault?: boolean;
}) {
  const t = useTranslations("connectionSelection");
  const selected =
    selectedIds ??
    (allowDefault ? [] : connections.map((connection) => connection.id));
  return (
    <fieldset className="my-2 min-w-0 rounded-lg border bg-muted/25 p-3">
      <legend className="px-1 text-xs font-medium">{t("title")}</legend>
      <p className="mb-2 text-xs text-muted-foreground">
        {t(allowDefault ? "assistantHint" : "conversationHint")}
      </p>
      {allowDefault && (
        <label className="mb-2 flex min-h-9 items-center gap-2 text-xs">
          <Checkbox
            aria-label={t("default")}
            checked={selectedIds == null}
            onCheckedChange={(checked) => onChange(checked ? null : [])}
          />
          {t("default")}
        </label>
      )}
      <div className="max-h-52 space-y-1 overflow-y-auto">
        {connections.map((connection) => (
          <label
            key={connection.id}
            className="flex min-h-10 cursor-pointer items-start gap-2 rounded-md p-2 hover:bg-muted"
          >
            <Checkbox
              className="mt-0.5"
              aria-label={`${connection.label} ${connection.instanceUrl ?? ""}`}
              checked={selected.includes(connection.id)}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? [...selected, connection.id]
                    : selected.filter((id) => id !== connection.id),
                )
              }
            />
            <span className="min-w-0 text-xs">
              <span className="block font-medium">{connection.label}</span>
              <span className="block break-all text-muted-foreground">
                {connection.instanceUrl ?? t("unknownUrl")}
              </span>
            </span>
          </label>
        ))}
      </div>
      {!connections.length && (
        <p className="text-xs text-muted-foreground">{t("empty")}</p>
      )}
      {selectedIds?.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">{t("none")}</p>
      )}
      {!allowDefault && selectedIds != null && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(null)}
        >
          {t("reset")}
        </Button>
      )}
    </fieldset>
  );
}
