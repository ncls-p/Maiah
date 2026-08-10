import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import type { KnowledgeAgent } from "./page.knowledge-base";

export function useKnowledgeAgentAttachment(input: {
  workspaceId: string | null;
  selectedId: string | null;
  selectedBaseCanEdit: boolean;
}) {
  const { workspaceId, selectedId, selectedBaseCanEdit } = input;
  const t = useTranslations("knowledge");
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachAgents, setAttachAgents] = useState<KnowledgeAgent[]>([]);
  const [loadingAttachAgents, setLoadingAttachAgents] = useState(false);
  const [attachAgentsError, setAttachAgentsError] = useState(false);
  const [attachingAgentId, setAttachingAgentId] = useState<string | null>(null);
  async function openAttachDialog() {
    const canAttachKnowledgeBase = Boolean(
      selectedBaseCanEdit && workspaceId && selectedId,
    );
    if (!canAttachKnowledgeBase) return;
    setAttachOpen(true);
    setLoadingAttachAgents(true);
    setAttachAgentsError(false);
    try {
      const res = await fetch(
        `/api/workspace/agents?workspaceId=${workspaceId}&includeModelMeta=true`,
      );
      if (!res.ok) throw new Error(t("errorLoadAgents"));
      const data = (await res.json()) as
        { agents?: KnowledgeAgent[] } | KnowledgeAgent[];
      setAttachAgents(Array.isArray(data) ? data : (data.agents ?? []));
    } catch (error) {
      setAttachAgentsError(true);
      toast.error(
        error instanceof Error ? error.message : t("errorLoadAgents"),
      );
      return;
    } finally {
      setLoadingAttachAgents(false);
    }
  }

  async function attachBaseToAgent(agentId: string) {
    const canAttachKnowledgeBase = Boolean(
      selectedBaseCanEdit && workspaceId && selectedId,
    );
    if (!canAttachKnowledgeBase) return;
    setAttachingAgentId(agentId);
    try {
      const targetAgent = attachAgents.find((agent) => agent.id === agentId);
      if (!targetAgent) throw new Error(t("errorAttachAgent"));
      const bindingsRes = await fetch(
        `/api/workspace/agents/${agentId}/knowledge?workspaceId=${workspaceId}`,
      );
      if (!bindingsRes.ok) throw new Error(t("errorAttachAgent"));
      const currentBindings =
        (
          (await bindingsRes.json()) as {
            bindings?: Array<{ knowledgeBaseId: string }>;
          }
        ).bindings ?? [];
      const knowledgeBaseIds = Array.from(
        new Set([
          ...currentBindings.map((binding) => binding.knowledgeBaseId),
          selectedId,
        ]),
      );
      const res = await fetch(`/api/workspace/agents/${agentId}/knowledge`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          baseVersionId: targetAgent.activeVersionId,
          knowledgeBaseIds,
        }),
      });
      if (!res.ok) throw new Error(t("errorAttachAgent"));
      toast.success(t("toastAttachedAgent"));
      setAttachOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("errorAttachAgent"),
      );
      return;
    } finally {
      setAttachingAgentId(null);
    }
  }
  return {
    attachOpen,
    setAttachOpen,
    attachAgents,
    loadingAttachAgents,
    attachAgentsError,
    attachingAgentId,
    openAttachDialog,
    attachBaseToAgent,
  };
}
