"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeftIcon, WorkflowIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { PageEmptyState } from "@/components/page-empty-state";
import { PageLoading } from "@/components/page-loading";
import { Button } from "@/components/ui/button";
import { WorkflowBuilder } from "@/components/workflows/workflow-builder";
import type { WorkflowDetail } from "@/components/workflows/types";
import { WorkspacePage } from "@/components/workspace-page";
import { useWorkspace } from "@/hooks/use-workspace";
import { Link } from "@/i18n/navigation";
import { fetchJson } from "@/lib/api-client";

type AgentOption = { id: string; name: string };
type AgentPayload = AgentOption[] | { agents: AgentOption[] };

export function WorkflowEditorPage({ workflowId }: { workflowId: string }) {
  const t = useTranslations("workflows");
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(false);
    try {
      const [workflowPayload, agentPayload] = await Promise.all([
        fetchJson<{ workflow: WorkflowDetail }>(
          `/api/workspace/workflows/${workflowId}?workspaceId=${workspaceId}`,
        ),
        fetchJson<AgentPayload>(
          `/api/workspace/agents?workspaceId=${workspaceId}`,
        ),
      ]);
      setWorkflow(workflowPayload.workflow);
      setAgents(
        Array.isArray(agentPayload) ? agentPayload : agentPayload.agents,
      );
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [workflowId, workspaceId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  return (
    <WorkspacePage
      title={workflow?.name ?? t("title")}
      description={t("editorDescription")}
      width="full"
      actions={
        <Button asChild variant="ghost">
          <Link href="/workflows">
            <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
            {t("back")}
          </Link>
        </Button>
      }
      className="pb-4"
    >
      {workspaceLoading || loading ? (
        <PageLoading label={t("loading")} />
      ) : error || !workflow || !workspaceId ? (
        <PageEmptyState icon={WorkflowIcon} title={t("loadFailed")}>
          <Button variant="outline" onClick={() => void load()}>
            {t("refreshRuns")}
          </Button>
        </PageEmptyState>
      ) : (
        <WorkflowBuilder
          key={`${workflow.id}:${workflow.version}`}
          workspaceId={workspaceId}
          initialWorkflow={workflow}
          agents={agents}
        />
      )}
    </WorkspacePage>
  );
}
