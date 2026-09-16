"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ErrorDetailsButton } from "@/components/ui/error-details-button";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchJson } from "@/lib/api-client";
import type { CompanionState } from "@/modules/companion/contracts";
import { CompanionPanel } from "./companion-panel";
export function Companion({ userId }: { userId: string }) {
  const t = useTranslations("companion");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const { workspaceId } = useWorkspace();
  const [snapshot, setSnapshot] = useState<{
    workspaceId: string;
    state: CompanionState;
  } | null>(null);
  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const state = await fetchJson<CompanionState>(
          `/api/companion?workspaceId=${workspaceId}`,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setSnapshot({ workspaceId, state });
          setError("");
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : t("loadError"));
      }
    };
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 30_000);
    window.addEventListener("maiah:companion-settings", load);
    window.addEventListener("focus", load);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("maiah:companion-settings", load);
      window.removeEventListener("focus", load);
    };
  }, [workspaceId, revision, t]);
  if (error && (!snapshot || snapshot.workspaceId !== workspaceId))
    return (
      <aside
        data-companion-root
        className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border bg-background p-3"
        role="alert"
      >
        <p>
          {t("loadError")}: {error}
        </p>
        <ErrorDetailsButton />
        <Button onClick={() => setRevision((value) => value + 1)}>
          {t("retry")}
        </Button>
      </aside>
    );
  if (
    !workspaceId ||
    snapshot?.workspaceId !== workspaceId ||
    !snapshot.state.available
  )
    return null;
  return (
    <CompanionPanel
      key={`${userId}:${workspaceId}:${snapshot.state.agentId}`}
      connectionError={error}
      onRetry={() => setRevision((value) => value + 1)}
      userId={userId}
      workspaceId={workspaceId}
      state={snapshot.state}
    />
  );
}
