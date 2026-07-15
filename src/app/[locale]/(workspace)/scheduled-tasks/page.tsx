"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CalendarClockIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { ChatAgent } from "@/components/chat/chat-types";
import { PageEmptyState } from "@/components/page-empty-state";
import { PageLoading } from "@/components/page-loading";
import { ScheduledTaskManager } from "@/components/scheduled-tasks/scheduled-task-manager";
import { WorkspacePage } from "@/components/workspace-page";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchJson } from "@/lib/api-client";

type AgentsPayload = ChatAgent[] | { agents: ChatAgent[] };

function normalizeAgents(payload: AgentsPayload) {
  return Array.isArray(payload) ? payload : payload.agents;
}

export default function ScheduledTasksPage() {
  const t = useTranslations("scheduledTasks");
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const [agents, setAgents] = useState<ChatAgent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const loadAgents = useCallback(async () => {
    if (!workspaceId) return;
    setLoadingAgents(true);
    setLoadError(false);
    try {
      const data = await fetchJson<AgentsPayload>(
        `/api/workspace/agents?workspaceId=${workspaceId}`,
      );
      setAgents(normalizeAgents(data));
    } catch {
      setLoadError(true);
    } finally {
      setLoadingAgents(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadAgents(), 0);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [loadAgents]);

  const loading = workspaceLoading || loadingAgents;

  return (
    <WorkspacePage
      title={t("title")}
      description={t("description")}
      width="wide"
    >
      {loading ? (
        <PageLoading label={t("loadingAgents")} />
      ) : loadError ? (
        <div
          className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5"
          role="alert"
        >
          <h2 className="text-base font-semibold">{t("loadErrorTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("loadErrorDescription")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => void loadAgents()}
          >
            {t("retry")}
          </Button>
        </div>
      ) : agents.length === 0 ? (
        <PageEmptyState
          icon={CalendarClockIcon}
          title={t("noAssistants.title")}
          description={t("noAssistants.description")}
        >
          <Button asChild>
            <Link href="/agents">{t("noAssistants.cta")}</Link>
          </Button>
        </PageEmptyState>
      ) : (
        <ScheduledTaskManager workspaceId={workspaceId} agents={agents} />
      )}
    </WorkspacePage>
  );
}
