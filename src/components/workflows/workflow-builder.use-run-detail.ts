"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
  const [runDetailOpen, setRunDetailOpen] = useState(false);
  async function loadRunDetail(runId: string) {
    setRunDetail(null);
    setRunDetailOpen(true);
    setRunDetailLoading(true);
    try {
      const payload = await fetchJson<{ run: WorkflowRunDetail }>(
        `/api/workspace/workflow-runs/${runId}?workspaceId=${workspaceId}`,
      );
      setRunDetail(payload.run);
    } catch (error) {
      setRunDetailOpen(false);
      toast.error(
        error instanceof Error ? error.message : t("runDetailFailed"),
      );
    } finally {
      setRunDetailLoading(false);
    }
  }
  useEffect(() => {
    if (
      !runDetailOpen ||
      !runDetail ||
      !["queued", "running"].includes(runDetail.status)
    )
      return;
    const interval = window.setInterval(async () => {
      try {
        const payload = await fetchJson<{ run: WorkflowRunDetail }>(
          `/api/workspace/workflow-runs/${runDetail.id}?workspaceId=${workspaceId}`,
        );
        setRunDetail(payload.run);
        if (!["queued", "running"].includes(payload.run.status))
          await loadRuns();
      } catch {
        /* Keep the last visible snapshot; the user can retry. */
      }
    }, 1_500);
    return () => window.clearInterval(interval);
  }, [loadRuns, runDetail, runDetailOpen, workspaceId]);
  return {
    loadRunDetail,
    runDetail,
    runDetailLoading,
    runDetailOpen,
    setRunDetail,
    setRunDetailOpen,
  } as const;
}
