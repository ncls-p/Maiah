import { useTranslations } from "next-intl";
import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { fetchJson } from "@/lib/api-client";
import type {
  MemberTransferDestination,
  MemberTransferPreview,
} from "./access-console.access-member";

export function useAccessMemberTransfer(input: {
  workspaceId: string | null;
  selectedPeople: string[];
  setSelectedPeople: Dispatch<SetStateAction<string[]>>;
  setPendingAction: Dispatch<SetStateAction<string | null>>;
  load: (options?: { preserveData?: boolean }) => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
}) {
  const {
    workspaceId,
    selectedPeople,
    setSelectedPeople,
    setPendingAction,
    load,
    refreshWorkspaces,
  } = input;
  const t = useTranslations("access");
  const [memberTransferOpen, setMemberTransferOpen] = useState(false);
  const [memberTransferDestinations, setMemberTransferDestinations] = useState<
    MemberTransferDestination[]
  >([]);
  const [memberTransferLoading, setMemberTransferLoading] = useState(false);
  const [memberTransferQuery, setMemberTransferQuery] = useState("");
  const [memberTransferTargetId, setMemberTransferTargetId] = useState("");
  const [memberTransferRoleId, setMemberTransferRoleId] = useState("");
  const [memberTransferMode, setMemberTransferMode] = useState<"add" | "move">(
    "add",
  );
  const [memberTransferPreview, setMemberTransferPreview] =
    useState<MemberTransferPreview | null>(null);
  async function openMemberTransfer() {
    if (!workspaceId) return;
    setMemberTransferOpen(true);
    setMemberTransferLoading(true);
    setMemberTransferPreview(null);
    setMemberTransferTargetId("");
    setMemberTransferRoleId("");
    setMemberTransferQuery("");
    try {
      const result = await fetchJson<{
        destinations: MemberTransferDestination[];
      }>(
        `/api/workspace/iam/members/transfer?sourceWorkspaceId=${workspaceId}`,
      );
      setMemberTransferDestinations(result.destinations);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("memberTransferLoadFailed"),
      );
      setMemberTransferOpen(false);
    } finally {
      setMemberTransferLoading(false);
    }
  }

  async function previewSelectedMemberTransfer() {
    if (!workspaceId || !memberTransferTargetId || !memberTransferRoleId)
      return;
    setPendingAction("previewMemberTransfer");
    try {
      const preview = await fetchJson<MemberTransferPreview>(
        "/api/workspace/iam/members/transfer",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "preview",
            sourceWorkspaceId: workspaceId,
            targetWorkspaceId: memberTransferTargetId,
            userIds: selectedPeople,
            roleId: memberTransferRoleId,
            mode: memberTransferMode,
          }),
        },
      );
      setMemberTransferPreview(preview);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("memberTransferPreviewFailed"),
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function confirmSelectedMemberTransfer() {
    if (
      !workspaceId ||
      !memberTransferTargetId ||
      !memberTransferRoleId ||
      !memberTransferPreview
    )
      return;
    setPendingAction("executeMemberTransfer");
    try {
      const result = await fetchJson<{ transferred: number }>(
        "/api/workspace/iam/members/transfer",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "execute",
            sourceWorkspaceId: workspaceId,
            targetWorkspaceId: memberTransferTargetId,
            userIds: selectedPeople,
            roleId: memberTransferRoleId,
            mode: memberTransferMode,
            confirmationToken: memberTransferPreview.confirmationToken,
          }),
        },
      );
      toast.success(
        t("memberTransferCompleted", { count: result.transferred }),
      );
      setSelectedPeople([]);
      setMemberTransferOpen(false);
      setMemberTransferPreview(null);
      await refreshWorkspaces();
      await load({ preserveData: true });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("memberTransferFailed"),
      );
      setMemberTransferPreview(null);
    } finally {
      setPendingAction(null);
    }
  }

  return {
    memberTransferOpen,
    setMemberTransferOpen,
    memberTransferDestinations,
    memberTransferLoading,
    memberTransferQuery,
    setMemberTransferQuery,
    memberTransferTargetId,
    setMemberTransferTargetId,
    memberTransferRoleId,
    setMemberTransferRoleId,
    memberTransferMode,
    setMemberTransferMode,
    memberTransferPreview,
    setMemberTransferPreview,
    openMemberTransfer,
    previewSelectedMemberTransfer,
    confirmSelectedMemberTransfer,
  };
}
