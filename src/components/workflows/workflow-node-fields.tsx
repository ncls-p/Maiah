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

type AgentOption = { id: string; name: string };

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

function KeyValueEditor({
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

function FieldControl({
  nodeId,
  field,
  value,
  agents,
  onChange,
}: {
  nodeId: string;
  field: WorkflowNodeField;
  value: unknown;
  agents: AgentOption[];
  onChange: (value: unknown) => void;
}) {
  const t = useTranslations("workflows");
  const id = `workflow-${nodeId}-${field.key}`;

  if (field.control === "select" || field.control === "agent") {
    const options =
      field.control === "agent"
        ? agents.map((agent) => ({ value: agent.id, label: agent.name }))
        : (field.options ?? []).map((option) => ({
            value: option.value,
            label: t.has(`options.${option.label}`)
              ? t(`options.${option.label}`)
              : option.label,
          }));
    return (
      <Select value={String(value ?? "")} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={t(`fields.${field.label}`)} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    );
  }
  if (field.control === "number") {
    return (
      <Input
        id={id}
        type="number"
        min={field.min}
        max={field.max}
        step={field.step}
        value={typeof value === "number" ? value : Number(value ?? 0)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    );
  }
  if (field.control === "textarea" || field.control === "code") {
    return (
      <Textarea
        id={id}
        value={String(value ?? "")}
        onChange={(event) => onChange(event.target.value)}
        className={
          field.control === "code" ? "min-h-72 font-mono text-xs" : "min-h-32"
        }
        spellCheck={field.control !== "code"}
      />
    );
  }
  if (field.control === "json") {
    return <JsonValueEditor id={id} value={value} onChange={onChange} />;
  }
  if (field.control === "keyValue") {
    return <KeyValueEditor id={id} value={value} onChange={onChange} />;
  }
  if (field.control === "stringList") {
    return (
      <Textarea
        id={id}
        value={Array.isArray(value) ? value.join("\n") : ""}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(/[\n,]/)
              .map((item) => item.trim())
              .filter(Boolean),
          )
        }
        className="min-h-28 font-mono text-xs"
        placeholder={t("pathListPlaceholder")}
      />
    );
  }
  return (
    <Input
      id={id}
      value={String(value ?? "")}
      onChange={(event) => onChange(event.target.value)}
      placeholder={field.placeholder ? t(field.placeholder) : undefined}
    />
  );
}

function NodeFields({
  nodeId,
  fields,
  parameters,
  agents,
  onChange,
}: {
  nodeId: string;
  fields: readonly WorkflowNodeField[];
  parameters: Record<string, unknown>;
  agents: AgentOption[];
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const t = useTranslations("workflows");
  return (
    <FieldGroup>
      {fields.map((field) => {
        if (
          field.showWhen &&
          parameters[field.showWhen.key] !== field.showWhen.equals
        ) {
          return null;
        }
        const id = `workflow-${nodeId}-${field.key}`;
        return (
          <Field key={field.key}>
            <FieldLabel htmlFor={id}>{t(`fields.${field.label}`)}</FieldLabel>
            <FieldControl
              nodeId={nodeId}
              field={field}
              value={parameters[field.key]}
              agents={agents}
              onChange={(value) => onChange({ [field.key]: value })}
            />
            {field.description ? (
              <FieldDescription>{t(field.description)}</FieldDescription>
            ) : null}
          </Field>
        );
      })}
    </FieldGroup>
  );
}

export function WorkflowNodeFields({
  nodeId,
  catalogItem,
  parameters,
  agents,
  onChange,
}: {
  nodeId: string;
  catalogItem: WorkflowNodeCatalogItem;
  parameters: Record<string, unknown>;
  agents: AgentOption[];
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const t = useTranslations("workflows");
  const basicFields = catalogItem.fields.filter((field) => !field.advanced);
  const advancedFields = catalogItem.fields.filter((field) => field.advanced);

  return (
    <div className="flex flex-col gap-5">
      <NodeFields
        nodeId={nodeId}
        fields={basicFields}
        parameters={parameters}
        agents={agents}
        onChange={onChange}
      />
      {advancedFields.length > 0 ? (
        <AdvancedSection
          label={t("advancedOptions")}
          hint={t("advancedOptionsHint")}
          icon={SlidersHorizontalIcon}
        >
          <NodeFields
            nodeId={nodeId}
            fields={advancedFields}
            parameters={parameters}
            agents={agents}
            onChange={onChange}
          />
        </AdvancedSection>
      ) : null}
    </div>
  );
}
