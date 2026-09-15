"use client";

import { ErrorDetailsButton } from "@/components/ui/error-details-button";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchJson } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WorkflowValueField } from "./workflow-value-field";

type WorkflowOption = {
  id: string;
  name: string;
  activeVersion: number | null;
};
export function WorkflowCallFields({
  nodeId,
  parameters,
  onChange,
}: {
  nodeId: string;
  parameters: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const t = useTranslations("workflows.chaining");
  const { workspaceId } = useWorkspace();
  const [workflows, setWorkflows] = useState<WorkflowOption[]>([]);
  const [state, setState] = useState("loading");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!workspaceId) return;
    let disposed = false;
    fetchJson<{ workflows: WorkflowOption[] }>(
      `/api/workspace/workflows?workspaceId=${workspaceId}`,
    )
      .then((result) => {
        if (!disposed) {
          setWorkflows(result.workflows.filter((item) => item.activeVersion));
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
  if (state === "loading") return <p role="status">{t("loading")}</p>;
  if (state === "error")
    return (
      <div role="alert">
        {t("failed")}
        <Button
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
  return (
    <div className="space-y-4">
      <Field>
        <FieldLabel htmlFor={`${nodeId}-workflow`}>{t("workflow")}</FieldLabel>
        <Select
          value={String(parameters.workflowId ?? "")}
          onValueChange={(workflowId) => onChange({ workflowId })}
        >
          <SelectTrigger id={`${nodeId}-workflow`}>
            <SelectValue placeholder={t("select")} />
          </SelectTrigger>
          <SelectContent>
            {workflows.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription>{t("hint")}</FieldDescription>
        {!workflows.length ||
        (parameters.workflowId &&
          !workflows.some((item) => item.id === parameters.workflowId)) ? (
          <FieldDescription>{t("unavailable")}</FieldDescription>
        ) : null}
      </Field>
      <Field>
        <FieldLabel htmlFor={`${nodeId}-input`}>{t("input")}</FieldLabel>
        <WorkflowValueField
          id={`${nodeId}-input`}
          schema={{ type: "object" }}
          value={parameters.input ?? "{{input}}"}
          onChange={(input) => onChange({ input })}
        />
        <FieldDescription>{t("result")}</FieldDescription>
      </Field>
    </div>
  );
}
