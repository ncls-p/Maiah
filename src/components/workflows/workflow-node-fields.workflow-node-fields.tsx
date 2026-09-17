"use client";

import { WorkflowCallFields } from "./workflow-call-fields";
import { WorkflowToolFields } from "./workflow-tool-fields";
import {
  WorkflowValueField,
  WorkflowVariablesContext,
} from "./workflow-value-field";
import { useContext } from "react";
import { SlidersHorizontalIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { AdvancedSection } from "@/components/ui/advanced-section";
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
import { WorkflowCodeEditor } from "./workflow-code-editor";
import type {
  WorkflowNodeCatalogItem,
  WorkflowNodeField,
} from "@/modules/workflows/catalog";
import {
  AgentOption,
  JsonValueEditor,
  KeyValueEditor,
} from "./workflow-node-fields.agent-option";

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
  const variables = useContext(WorkflowVariablesContext);

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
  if (field.control === "code") {
    return (
      <WorkflowCodeEditor
        id={id}
        value={String(value ?? "")}
        language={String(field.key === "code" ? "javascript" : "text")}
        onChange={onChange}
      />
    );
  }
  if (field.control === "textarea") {
    return (
      <div className="space-y-2">
        <Textarea
          id={id}
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-32"
          spellCheck
        />
        {field.description === "templateHint" ? (
          <Select
            value=""
            onValueChange={(path) =>
              onChange(`${String(value ?? "")}{{${path}}}`)
            }
          >
            <SelectTrigger aria-label={t("variables.insert")}>
              <SelectValue placeholder={t("variables.insert")} />
            </SelectTrigger>
            <SelectContent>
              {variables.map((variable) => (
                <SelectItem key={variable.path} value={variable.path}>
                  {variable.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
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
  if (field.description === "templateHint")
    return <WorkflowValueField id={id} value={value} onChange={onChange} />;
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
      {catalogItem.type === "workflow.run" ? (
        <WorkflowCallFields
          key={nodeId}
          nodeId={nodeId}
          parameters={parameters}
          onChange={onChange}
        />
      ) : null}
      {catalogItem.type === "tool.call" ? (
        <WorkflowToolFields
          key={nodeId}
          nodeId={nodeId}
          parameters={parameters}
          onChange={onChange}
        />
      ) : null}
      {catalogItem.type === "agent.run" ? (
        <p className="text-xs text-muted-foreground">
          {t("assistantToolsHint")}
        </p>
      ) : null}
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
