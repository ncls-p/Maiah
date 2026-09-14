"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Option } from "@/modules/analytics/types";

export function FilterSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("analytics");
  const [search, setSearch] = useState("");
  const selected = value.split(",").filter(Boolean);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between"
          aria-label={label}
        >
          {label}
          <span>{selected.length || t("all")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex flex-col gap-3">
        <Input
          aria-label={t("search", { label })}
          placeholder={t("search", { label })}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button size="sm" variant="ghost" onClick={() => onChange("")}>
          {t("clearSelection")}
        </Button>
        <div className="flex max-h-64 flex-col gap-3 overflow-y-auto p-1">
          {options
            .filter((option) =>
              option.name
                .toLocaleLowerCase()
                .includes(search.toLocaleLowerCase()),
            )
            .map((option) => (
              <label key={option.id} className="flex items-start gap-3 text-sm">
                <Checkbox
                  aria-label={option.name}
                  checked={selected.includes(option.id)}
                  onCheckedChange={(checked) =>
                    onChange(
                      (checked
                        ? [...selected, option.id]
                        : selected.filter((id) => id !== option.id)
                      ).join(","),
                    )
                  }
                />
                <span className="min-w-0 break-words">
                  {option.name}
                  <span className="ml-1 text-xs text-muted-foreground">
                    {option.id.slice(0, 6)}
                  </span>
                </span>
              </label>
            ))}
          {!options.length && (
            <p className="text-sm text-muted-foreground">{t("noOptions")}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
