"use client";

import type { Edge } from "@xyflow/react";
import { useTranslations } from "next-intl";
import {
  useEffect,
  useMemo,
  useState,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { toast } from "@/lib/toast";

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
  loadRunDetail,
}: {
  workspaceId: string;
  workflow: WorkflowDetail;
  setWorkflow: Dispatch<SetStateAction<WorkflowDetail>>;
  nodes: WorkflowCanvasNodeType[];
  edges: Edge[];
  loadRuns: () => Promise<void>;
  loadRunDetail: (runId: string) => Promise<void>;
}) {
  const t = useTranslations("workflows");
  const busyRef = useRef(false);
  const canEdit = workflow.capabilities?.canEdit === true;
  const canExecute = workflow.capabilities?.canExecute === true;
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

  async function persist(): Promise<WorkflowDetail | null> {
    if (!canEdit) return null;
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
      setWorkflow((current) => ({
        ...payload.workflow,
        capabilities: current.capabilities,
      }));
      toast.success(t("saved"));
      return payload.workflow;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveFailed"));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (busyRef.current) return null;
    busyRef.current = true;
    try {
      return await persist();
    } finally {
      busyRef.current = false;
    }
  }

  async function publish() {
    if (!canEdit || busyRef.current) return;
    busyRef.current = true;
    setPublishing(true);
    try {
      if (!(await persist())) return;
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
      busyRef.current = false;
      setPublishing(false);
    }
  }

  async function runWorkflow() {
    if (!canExecute || busyRef.current) return;
    if (!parsedRunInput.valid) {
      toast.error(t("invalidJson"));
      return;
    }
    busyRef.current = true;
    setRunning(true);
    try {
      if (canEdit && !(await persist())) return;
      const payload = await fetchJson<{ run: { id: string } }>(
        `/api/workspace/workflows/${workflow.id}/runs`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            input: parsedRunInput.input,
            useLatestDraft: canEdit,
          }),
        },
      );
      setRunSheetOpen(false);
      toast.success(t("runStarted"));
      await loadRuns();
      await loadRunDetail(payload.run.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("runFailed"));
    } finally {
      busyRef.current = false;
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
