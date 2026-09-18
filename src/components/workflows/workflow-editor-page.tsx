"use client";

import { ArrowLeftIcon, Share2Icon, WorkflowIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { PageEmptyState } from "@/components/page-empty-state";
import { PageLoading } from "@/components/page-loading";
import { Button } from "@/components/ui/button";
import type { WorkflowDetail } from "@/components/workflows/types";
import { WorkflowBuilder } from "@/components/workflows/workflow-builder";
import { WorkspacePage } from "@/components/workspace-page";
import { useWorkspace } from "@/hooks/use-workspace";
import { Link } from "@/i18n/navigation";
import { fetchJson } from "@/lib/api-client";
import { ResourceAccessDialog } from "@/components/resource-access-dialog";
import type { ResourceAccessOptions } from "@/modules/iam/resource-access-scope";

type AgentOption = { id: string; name: string };
type AgentPayload = AgentOption[] | { agents: AgentOption[] };

export function WorkflowEditorPage({ workflowId }: { workflowId: string }) {
  const t = useTranslations("workflows");
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const requestRef = useRef(0);
  const [loadedFor, setLoadedFor] = useState("");
  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sharingOpen, setSharingOpen] = useState(false);
  const [accessOptions, setAccessOptions] =
    useState<ResourceAccessOptions | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    const request = ++requestRef.current;
    setLoading(true);
    setError(false);
    try {
      const [workflowPayload, agentPayload, permissionPayload] =
        await Promise.all([
          fetchJson<{ workflow: WorkflowDetail }>(
            `/api/workspace/workflows/${workflowId}?workspaceId=${workspaceId}`,
          ),
          fetchJson<AgentPayload>(
            `/api/workspace/agents?workspaceId=${workspaceId}`,
          ),
          fetchJson<{ resourceAccessOptions: ResourceAccessOptions }>(
            `/api/workspace/permissions?workspaceId=${workspaceId}`,
          ),
        ]);
      if (request !== requestRef.current) return;
      setLoadedFor(`${workspaceId}:${workflowId}`);
      setWorkflow(workflowPayload.workflow);
      setAgents(
        Array.isArray(agentPayload) ? agentPayload : agentPayload.agents,
      );
      setAccessOptions(permissionPayload.resourceAccessOptions);
    } catch {
      if (request !== requestRef.current) return;
      setLoadedFor(`${workspaceId}:${workflowId}`);
      setError(true);
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [workflowId, workspaceId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const ready =
    loadedFor === `${workspaceId}:${workflowId}` && !loading && !error;
  return (
    <WorkspacePage
      title={ready ? (workflow?.name ?? t("title")) : t("title")}
      headerVariant="compact"
      width="full"
      fill
      actions={
        <div className="flex items-center gap-2">
          {ready && workflow?.capabilities?.canEdit && accessOptions ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setSharingOpen(true)}
            >
              <Share2Icon data-icon="inline-start" aria-hidden="true" />
              {t("access")}
            </Button>
          ) : null}
          <Button asChild variant="ghost">
            <Link href="/workflows">
              <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
              {t("back")}
            </Link>
          </Button>
        </div>
      }
      className="pb-4"
    >
      {ready && workflow && accessOptions && workspaceId ? (
        <ResourceAccessDialog
          open={sharingOpen}
          workspaceId={workspaceId}
          resource={{ id: workflow.id, name: workflow.name, type: "workflow" }}
          selection={workflow.access}
          options={accessOptions}
          onOpenChangeAction={setSharingOpen}
          onScopeSaveAction={async (access) => {
            const payload = await fetchJson<{ workflow: WorkflowDetail }>(
              `/api/workspace/workflows/${workflow.id}`,
              {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ workspaceId, access }),
              },
            );
            setWorkflow((current) => ({
              ...payload.workflow,
              capabilities: current?.capabilities,
            }));
          }}
        />
      ) : null}
      {workspaceLoading ||
      loading ||
      loadedFor !== `${workspaceId}:${workflowId}` ? (
        <PageLoading label={t("loading")} />
      ) : error || !workflow || !workspaceId ? (
        <PageEmptyState icon={WorkflowIcon} title={t("loadFailed")}>
          <Button variant="outline" onClick={() => void load()}>
            {t("refreshRuns")}
          </Button>
        </PageEmptyState>
      ) : (
        <WorkflowBuilder
          key={`${workspaceId}:${workflow.id}`}
          workspaceId={workspaceId}
          initialWorkflow={workflow}
          agents={agents}
        />
      )}
    </WorkspacePage>
  );
}
