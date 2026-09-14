"use client";
import { createContext, useContext, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JsonValueEditor } from "./workflow-node-fields.agent-option";
import type { WorkflowVariable } from "./workflow-variable-options";
export const WorkflowVariablesContext = createContext<WorkflowVariable[]>([]);

export function WorkflowValueField({
  id,
  value,
  onChange,
  schema = {},
}: {
  id: string;
  value: unknown;
  onChange: (value: unknown) => void;
  schema?: Record<string, unknown>;
}) {
  const t = useTranslations("workflows.variables");
  const variables = useContext(WorkflowVariablesContext);
  const expression =
    typeof value === "string" ? value.match(/^{{\s*([^{}]*?)\s*}}$/) : null;
  const [chosenMode, setChosenMode] = useState<"fixed" | "variable" | null>(
    null,
  );
  const mode = chosenMode ?? (expression ? "variable" : "fixed");
  const path = expression?.[1] ?? "";
  const preview = variables.find((item) => item.path === path)?.example;
  const complex = schema.type === "object" || schema.type === "array";
  return (
    <div className="space-y-2">
      <div className="flex gap-1" role="group" aria-label={t("mode")}>
        {(["fixed", "variable"] as const).map((option) => (
          <Button
            key={option}
            type="button"
            variant={mode === option ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={mode === option}
            onClick={() => {
              setChosenMode(option);
              onChange(
                option === "variable"
                  ? "{{input}}"
                  : schema.type === "boolean"
                    ? false
                    : schema.type === "number" || schema.type === "integer"
                      ? 0
                      : complex
                        ? schema.type === "array"
                          ? []
                          : {}
                        : "",
              );
            }}
          >
            {t(option)}
          </Button>
        ))}
      </div>
      {mode === "variable" ? (
        <>
          <Select
            value={variables.some((item) => item.path === path) ? path : ""}
            onValueChange={(next) => onChange(`{{${next}}}`)}
          >
            <SelectTrigger aria-label={t("select")}>
              <SelectValue placeholder={t("select")} />
            </SelectTrigger>
            <SelectContent>
              {variables.map((item) => (
                <SelectItem key={item.path} value={item.path}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            id={id}
            aria-label={t("path")}
            placeholder="toolResult.number"
            value={path}
            onChange={(event) => onChange(`{{${event.target.value}}}`)}
          />
          <p className="break-words text-xs text-muted-foreground">
            {preview === undefined
              ? t("runtimeValue")
              : t("preview", { value: JSON.stringify(preview).slice(0, 200) })}
          </p>
        </>
      ) : Array.isArray(schema.enum) || schema.type === "boolean" ? (
        <Select
          value={value === undefined ? "" : JSON.stringify(value)}
          onValueChange={(next) => onChange(JSON.parse(next))}
        >
          <SelectTrigger id={id}>
            <SelectValue placeholder={t("choose")} />
          </SelectTrigger>
          <SelectContent>
            {(Array.isArray(schema.enum) ? schema.enum : [true, false]).map(
              (option) => (
                <SelectItem
                  key={JSON.stringify(option)}
                  value={JSON.stringify(option)}
                >
                  {String(option)}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      ) : complex ? (
        <JsonValueEditor key={id} id={id} value={value} onChange={onChange} />
      ) : (
        <Input
          id={id}
          type={
            schema.type === "number" || schema.type === "integer"
              ? "number"
              : "text"
          }
          value={String(value ?? "")}
          onChange={(event) =>
            onChange(
              schema.type === "number" || schema.type === "integer"
                ? event.target.value === ""
                  ? undefined
                  : Number(event.target.value)
                : event.target.value,
            )
          }
        />
      )}
    </div>
  );
}
