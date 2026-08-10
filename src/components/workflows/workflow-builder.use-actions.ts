"use client";

import type { Edge } from "@xyflow/react";
import { useTranslations } from "next-intl";
import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { toast } from "sonner";

import { fetchJson } from "@/lib/api-client";
import type { WorkflowDetail } from "./types";
import { workflowDefinition } from "./workflow-builder.node-types";
import {
  formatWorkflowRunInput,
  parseWorkflowRunInput,
} from "./workflow-builder.run-input";
import type { WorkflowCanvasNodeType } from "./workflow-canvas-node";

export function useWorkflowActions({
  workspaceId,
  workflow,
  setWorkflow,
  nodes,
  edges,
  loadRuns,
}: {
  workspaceId: string;
  workflow: WorkflowDetail;
  setWorkflow: Dispatch<SetStateAction<WorkflowDetail>>;
  nodes: WorkflowCanvasNodeType[];
  edges: Edge[];
  loadRuns: () => Promise<void>;
}) {
  const t = useTranslations("workflows");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [running, setRunning] = useState(false);
  const [runSheetOpen, setRunSheetOpen] = useState(false);
  const [runInput, setRunInput] = useState(() =>
    formatWorkflowRunInput(workflow.definition.defaultInput),
  );
  const parsedRunInput = useMemo(
    () => parseWorkflowRunInput(runInput),
    [runInput],
  );
  const savedRunInput = useMemo(
    () => formatWorkflowRunInput(workflow.definition.defaultInput),
    [workflow.definition.defaultInput],
  );
  useEffect(() => {
    const timeout = window.setTimeout(() => setRunInput(savedRunInput), 0);
    return () => window.clearTimeout(timeout);
  }, [savedRunInput]);

  async function save(): Promise<WorkflowDetail | null> {
    if (!parsedRunInput.valid) {
      toast.error(t("invalidJson"));
      return null;
    }
    setSaving(true);
    try {
      const payload = await fetchJson<{ workflow: WorkflowDetail }>(
        `/api/workspace/workflows/${workflow.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            name: workflow.name,
            description: workflow.description,
            definition: workflowDefinition(nodes, edges, parsedRunInput.input),
          }),
        },
      );
      setWorkflow(payload.workflow);
      toast.success(t("saved"));
      return payload.workflow;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveFailed"));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    setPublishing(true);
    try {
      if (!(await save())) return;
      const payload = await fetchJson<{ workflow: WorkflowDetail }>(
        `/api/workspace/workflows/${workflow.id}/publish`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId }),
        },
      );
      setWorkflow((current) => ({ ...current, ...payload.workflow }));
      toast.success(t("published"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("publishFailed"));
    } finally {
      setPublishing(false);
    }
  }

  async function runWorkflow() {
    if (!parsedRunInput.valid) {
      toast.error(t("invalidJson"));
      return;
    }
    setRunning(true);
    try {
      if (!(await save())) return;
      await fetchJson(`/api/workspace/workflows/${workflow.id}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          input: parsedRunInput.input,
          useLatestDraft: true,
        }),
      });
      setRunSheetOpen(false);
      toast.success(t("runStarted"));
      await loadRuns();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("runFailed"));
    } finally {
      setRunning(false);
    }
  }

  return {
    publish,
    publishing,
    runInput,
    runInputDirty: runInput !== savedRunInput,
    runInputValid: parsedRunInput.valid,
    runSheetOpen,
    runWorkflow,
    running,
    save,
    saving,
    setRunInput,
    setRunSheetOpen,
  } as const;
}
