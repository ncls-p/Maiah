"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";

import { fetchJson } from "@/lib/api-client";
import type { WorkflowRunDetail } from "./types";

export function useWorkflowRunDetail({
  workspaceId,
  loadRuns,
}: {
  workspaceId: string;
  loadRuns: () => Promise<void>;
}) {
  const t = useTranslations("workflows");
  const [runDetail, setRunDetail] = useState<WorkflowRunDetail | null>(null);
  const [runDetailLoading, setRunDetailLoading] = useState(false);
  const [requestedRunId, setRequestedRunId] = useState<string | null>(null);
  const [runDetailOpen, setRunDetailOpen] = useState(false);
  const requestRef = useRef(0);
  const [runDetailError, setRunDetailError] = useState<string | null>(null);
  async function loadRunDetail(runId: string) {
    const request = ++requestRef.current;
    setRequestedRunId(runId);
    setRunDetailError(null);
    setRunDetail(null);
    setRunDetailOpen(true);
    setRunDetailLoading(true);
    try {
      const payload = await fetchJson<{ run: WorkflowRunDetail }>(
        `/api/workspace/workflow-runs/${runId}?workspaceId=${workspaceId}`,
      );
      if (request === requestRef.current) setRunDetail(payload.run);
    } catch (error) {
      if (request !== requestRef.current) return;
      setRunDetailError(t("runDetailFailed"));
      toast.error(
        error instanceof Error ? error.message : t("runDetailFailed"),
      );
    } finally {
      if (request === requestRef.current) setRunDetailLoading(false);
    }
  }
  useEffect(() => {
    if (!runDetail || !["queued", "running"].includes(runDetail.status)) return;
    let disposed = false;
    let fetching = false;
    const interval = window.setInterval(async () => {
      if (fetching) return;
      fetching = true;
      try {
        const payload = await fetchJson<{ run: WorkflowRunDetail }>(
          `/api/workspace/workflow-runs/${runDetail.id}?workspaceId=${workspaceId}`,
        );
        if (disposed) return;
        setRunDetail(payload.run);
        setRunDetailError(null);
        if (!["queued", "running"].includes(payload.run.status))
          await loadRuns();
      } catch {
        if (!disposed) setRunDetailError(t("runRefreshFailed"));
      } finally {
        fetching = false;
      }
    }, 1_500);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [loadRuns, runDetail, workspaceId, t]);
  return {
    requestedRunId,
    loadRunDetail,
    runDetail,
    runDetailError,
    runDetailLoading,
    runDetailOpen,
    setRunDetail,
    setRunDetailOpen,
  } as const;
}
