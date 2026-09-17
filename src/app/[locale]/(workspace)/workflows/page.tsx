"use client";

import {
  ArrowRightIcon,
  PlusIcon,
  WorkflowIcon,
  LockKeyholeIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/lib/toast";

import { PageEmptyState } from "@/components/page-empty-state";
import { ResourcePackageImport } from "@/components/marketplace/resource-package-import";
import { ResourcePackageExport } from "@/components/marketplace/resource-package-export";
import { PageLoading } from "@/components/page-loading";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { WorkflowSummary } from "@/components/workflows/types";
import { WorkspacePage } from "@/components/workspace-page";
import { useWorkspace } from "@/hooks/use-workspace";
import { useRouter } from "@/i18n/navigation";
import { fetchJson } from "@/lib/api-client";

export default function WorkflowsPage() {
  const t = useTranslations("workflows");
  const router = useRouter();
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState<string | null>(
    null,
  );
  const [loadError, setLoadError] = useState(false);

  const loadWorkflows = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const payload = await fetchJson<{ workflows: WorkflowSummary[] }>(
        `/api/workspace/workflows?workspaceId=${workspaceId}`,
      );
      setWorkflows(payload.workflows);
      setLoadedWorkspaceId(workspaceId);
    } catch {
      setLoadError(true);
      setLoadedWorkspaceId(workspaceId);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadWorkflows(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadWorkflows]);

  async function createWorkflow() {
    if (!workspaceId || creating) return;
    setCreating(true);
    try {
      const payload = await fetchJson<{ workflow: WorkflowSummary }>(
        "/api/workspace/workflows",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId, name: t("defaultName") }),
        },
      );
      router.push(`/workflows/${payload.workflow.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("loadFailed"));
    } finally {
      setCreating(false);
    }
  }

  const isLoading =
    workspaceLoading || loading || loadedWorkspaceId !== workspaceId;
  const matches = workflows.filter((workflow) =>
    `${workflow.name} ${workflow.description ?? ""}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );

  return (
    <WorkspacePage
      title={t("title")}
      description={t("description")}
      width="wide"
      actions={
        <>
          <ResourcePackageImport key={workspaceId} workspaceId={workspaceId} />
          <Button
            type="button"
            onClick={() => void createWorkflow()}
            disabled={creating || !workspaceId}
          >
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            {creating ? t("creating") : t("create")}
          </Button>
        </>
      }
    >
      {isLoading ? (
        <PageLoading label={t("loading")} />
      ) : loadError ? (
        <PageEmptyState
          icon={WorkflowIcon}
          title={t("loadFailed")}
          description={t("description")}
        >
          <Button variant="outline" onClick={() => void loadWorkflows()}>
            {t("refreshRuns")}
          </Button>
        </PageEmptyState>
      ) : workflows.length === 0 ? (
        <PageEmptyState
          icon={WorkflowIcon}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          className="min-h-[24rem] border border-dashed border-border/80 bg-muted/20"
        >
          <Button type="button" onClick={() => void createWorkflow()}>
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            {t("create")}
          </Button>
        </PageEmptyState>
      ) : (
        <div className="flex flex-col gap-5">
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
            className="max-w-md"
          />
          {matches.length === 0 ? (
            <p role="status" className="py-8 text-sm text-muted-foreground">
              {t("noMatches")}
            </p>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {matches.map((workflow) => (
              <Card
                key={workflow.id}
                className="min-h-48 transition-shadow hover:shadow-md"
              >
                <CardHeader>
                  <CardTitle className="min-w-0 break-words">
                    <Link href={`/workflows/${workflow.id}`}>
                      {workflow.name}
                    </Link>
                  </CardTitle>
                  <CardDescription className="line-clamp-2">
                    {workflow.description || t("editorDescription")}
                  </CardDescription>
                  <CardAction>
                    <Badge
                      variant={
                        workflow.status === "active" ? "default" : "secondary"
                      }
                    >
                      {workflow.status === "active" ? t("active") : t("draft")}
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent className="mt-auto flex items-center gap-2 text-xs text-muted-foreground">
                  <LockKeyholeIcon
                    className="size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span>
                    {t(`accessScopes.${workflow.visibility ?? "private"}`)}
                  </span>
                </CardContent>
                <CardFooter className="justify-end">
                  <ResourcePackageExport
                    workspaceId={workspaceId}
                    resource={{
                      kind: "workflow",
                      id: workflow.id,
                      name: workflow.name,
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => router.push(`/workflows/${workflow.id}`)}
                  >
                    {t("open")}
                    <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      )}
    </WorkspacePage>
  );
}
