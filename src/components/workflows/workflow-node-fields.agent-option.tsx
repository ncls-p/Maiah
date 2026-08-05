"use client";

import { useState } from "react";
import { PlusIcon, SlidersHorizontalIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";

import { AdvancedSection } from "@/components/ui/advanced-section";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  WorkflowNodeCatalogItem,
  WorkflowNodeField,
} from "@/modules/workflows/catalog";

export type AgentOption = { id: string; name: string };

function displayValue(value: unknown) {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  return JSON.stringify(value);
}

function parseValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

export function JsonValueEditor({
  id,
  value,
  onChange,
  className,
}: {
  id: string;
  value: unknown;
  onChange: (value: unknown) => void;
  className?: string;
}) {
  const t = useTranslations("workflows");
  const [text, setText] = useState(() =>
    value === undefined ? "" : JSON.stringify(value, null, 2),
  );
  const [invalid, setInvalid] = useState(false);

  return (
    <>
      <Textarea
        id={id}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setInvalid(false);
        }}
        onBlur={() => {
          if (!text.trim()) {
            setInvalid(false);
            onChange(undefined);
            return;
          }
          try {
            setInvalid(false);
            onChange(JSON.parse(text) as unknown);
          } catch {
            setInvalid(true);
          }
        }}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
        className={className ?? "min-h-28 font-mono text-xs"}
        spellCheck={false}
      />
      {invalid ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {t("invalidJson")}
        </p>
      ) : null}
    </>
  );
}

export function KeyValueEditor({
  id,
  value,
  onChange,
}: {
  id: string;
  value: unknown;
  onChange: (value: Record<string, unknown>) => void;
}) {
  const t = useTranslations("workflows");
  const entries = Object.entries(
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {},
  );

  function updateEntry(index: number, key: string, item: unknown) {
    const next = [...entries];
    next[index] = [key, item];
    onChange(Object.fromEntries(next.filter(([entryKey]) => entryKey.trim())));
  }

  return (
    <div className="flex flex-col gap-2">
      {entries.map(([key, item], index) => (
        <div
          key={`${index}-${key}`}
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_auto] gap-2"
        >
          <Input
            id={index === 0 ? id : undefined}
            value={key}
            onChange={(event) => updateEntry(index, event.target.value, item)}
            placeholder={t("keyPlaceholder")}
            aria-label={t("key")}
          />
          <Input
            value={displayValue(item)}
            onChange={(event) =>
              updateEntry(index, key, parseValue(event.target.value))
            }
            placeholder={t("valuePlaceholder")}
            aria-label={t("value")}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("removeRow")}
            onClick={() =>
              onChange(
                Object.fromEntries(entries.filter((_, row) => row !== index)),
              )
            }
          >
            <Trash2Icon />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange({ ...Object.fromEntries(entries), "": "" })}
      >
        <PlusIcon data-icon="inline-start" />
        {t("addRow")}
      </Button>
    </div>
  );
}
