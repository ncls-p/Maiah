"use client";

import { ErrorDetailsButton } from "@/components/ui/error-details-button";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchJson } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToolDetails } from "@/components/tools/tool-details";
import type { WorkflowToolOption } from "@/modules/workflows/tool-contracts";
import { objectValue } from "@/modules/workflows/runtime.workflow-runtime-dependencies";
import { WorkflowValueField } from "./workflow-value-field";
import { JsonValueEditor } from "./workflow-node-fields.agent-option";

export function WorkflowToolFields({
  nodeId,
  parameters,
  onChange,
}: {
  nodeId: string;
  parameters: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const t = useTranslations("workflows.directTools");
  const { workspaceId } = useWorkspace();
  const [tools, setTools] = useState<WorkflowToolOption[]>([]);
  const [search, setSearch] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!workspaceId) return;
    let disposed = false;
    fetchJson<{ tools: WorkflowToolOption[] }>(
      `/api/workspace/workflows/tools?workspaceId=${workspaceId}`,
    )
      .then((result) => {
        if (!disposed) {
          setTools(result.tools);
          setState("ready");
        }
      })
      .catch(() => {
        if (!disposed) setState("error");
      });
    return () => {
      disposed = true;
    };
  }, [workspaceId, revision]);
  const selected = tools.find(
    (tool) =>
      tool.id === parameters.toolId && tool.source === parameters.source,
  );
  const args = objectValue(parameters.arguments);
  const properties = objectValue(selected?.inputSchema?.properties);
  const required = Array.isArray(selected?.inputSchema?.required)
    ? selected.inputSchema.required
    : [];
  function select(key: string) {
    const tool = tools.find((item) => `${item.source}:${item.id}` === key);
    if (!tool) return;
    const defaults = Object.fromEntries(
      Object.entries(objectValue(tool.inputSchema?.properties)).flatMap(
        ([key, value]) => {
          const property = objectValue(value);
          return property.default === undefined
            ? []
            : [[key, property.default]];
        },
      ),
    );
    onChange({
      source: tool.source,
      toolId: tool.id,
      arguments: defaults,
      connectionId: undefined,
    });
  }
  if (state === "error")
    return (
      <div role="alert">
        <p>{t("failed")}</p>
        <Button
          variant="outline"
          onClick={() => {
            setState("loading");
            setRevision((value) => value + 1);
          }}
        >
          {t("retry")}
        </Button>
        <ErrorDetailsButton />
      </div>
    );
  if (state === "loading")
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t("loading")}
      </p>
    );
  return (
    <div className="space-y-4">
      <Field>
        <FieldLabel htmlFor={`${nodeId}-tool`}>{t("tool")}</FieldLabel>
        <Input
          aria-label={t("search")}
          placeholder={t("search")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          value={selected ? `${selected.source}:${selected.id}` : ""}
          onValueChange={select}
        >
          <SelectTrigger id={`${nodeId}-tool`}>
            <SelectValue placeholder={t("select")} />
          </SelectTrigger>
          <SelectContent>
            {tools
              .filter((tool) =>
                `${tool.name} ${tool.group}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((tool) => (
                <SelectItem
                  key={`${tool.source}:${tool.id}`}
                  value={`${tool.source}:${tool.id}`}
                >
                  {tool.group} · {tool.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        {tools.length === 0 ? (
          <FieldDescription>{t("empty")}</FieldDescription>
        ) : null}
        {parameters.toolId && !selected ? (
          <FieldDescription>{t("unavailable")}</FieldDescription>
        ) : null}
      </Field>
      {selected ? (
        <>
          {selected.source === "mcp" &&
          (selected.connections?.length || parameters.connectionId) ? (
            <Field>
              <FieldLabel htmlFor={`${nodeId}-connection`}>
                {t("connection")}
              </FieldLabel>
              <Select
                value={String(parameters.connectionId ?? "default")}
                onValueChange={(value) =>
                  onChange({
                    connectionId: value === "default" ? undefined : value,
                  })
                }
              >
                <SelectTrigger id={`${nodeId}-connection`}>
                  <SelectValue placeholder={t("defaultConnection")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">
                    {t("defaultConnection")}
                  </SelectItem>
                  {(selected.connections ?? []).map((connection) => (
                    <SelectItem key={connection.id} value={connection.id}>
                      {connection.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {parameters.connectionId &&
              !(selected.connections ?? []).some(
                (connection) => connection.id === parameters.connectionId,
              ) ? (
                <FieldDescription>
                  {t("connectionUnavailable")}
                </FieldDescription>
              ) : null}
            </Field>
          ) : null}
          <div className="flex items-start gap-2">
            <p className="flex-1 text-xs leading-5 text-muted-foreground">
              {selected.description}
            </p>
            <ToolDetails
              name={selected.name}
              description={selected.description}
              inputSchema={selected.inputSchema}
              outputSchema={selected.outputSchema}
              requireApproval={selected.requireApproval}
            />
          </div>
          {selected.requireApproval ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
              {t("approval")}
            </p>
          ) : null}
          {Object.entries(properties).map(([key, raw]) => {
            const schema = objectValue(raw);
            return (
              <Field key={`${selected.id}:${key}`}>
                <FieldLabel htmlFor={`${nodeId}-${key}`}>
                  {String(schema.title ?? key)}
                  {required.includes(key) ? " *" : ""}
                </FieldLabel>
                {schema.description ? (
                  <FieldDescription>
                    {String(schema.description)}
                  </FieldDescription>
                ) : null}
                <WorkflowValueField
                  id={`${nodeId}-${key}`}
                  schema={schema}
                  value={args[key]}
                  onChange={(value) => {
                    const next = { ...args, [key]: value };
                    if (value === undefined) delete next[key];
                    onChange({ arguments: next });
                  }}
                />
              </Field>
            );
          })}
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">
              {t("advanced")}
            </summary>
            <JsonValueEditor
              key={`${selected.id}:${JSON.stringify(args)}`}
              id={`${nodeId}-arguments`}
              value={args}
              onChange={(value) => onChange({ arguments: objectValue(value) })}
            />
          </details>
        </>
      ) : null}
    </div>
  );
}
