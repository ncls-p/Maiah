import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { fetchJson } from "@/lib/api-client";
import type { AccessResource, TransferDestination } from "./access-console.access-member";
import { INITIAL_TRANSFER_OPTIONS, type ResourceTransferOptions, type ResourceTransferPreview } from "./access-console.resource-transfer-preview";

export function useResourceTransfer(input: { workspaceId: string; loadResources: () => Promise<void> }) {
  const { workspaceId, loadResources } = input;
  const t = useTranslations("access");
  const [transferResource, setTransferResource] = useState<AccessResource | null>(null);
  const [transferDestinations, setTransferDestinations] = useState<TransferDestination[]>([]);
  const [destinationQuery, setDestinationQuery] = useState("");
  const [targetWorkspaceId, setTargetWorkspaceId] = useState("");
  const [transferOptions, setTransferOptions] = useState<ResourceTransferOptions>(INITIAL_TRANSFER_OPTIONS);
  const [transferPreview, setTransferPreview] = useState<ResourceTransferPreview | null>(null);
  const [transferLoading, setTransferLoading] = useState(false);
  const [advancedTransfer, setAdvancedTransfer] = useState(false);
  async function openTransfer(resource: AccessResource) {
    setTransferResource(resource);
    setTargetWorkspaceId("");
    setDestinationQuery("");
    setTransferOptions(INITIAL_TRANSFER_OPTIONS);
    setTransferPreview(null);
    setAdvancedTransfer(false);
    setTransferLoading(true);
    try {
      const params = new URLSearchParams({ sourceWorkspaceId: workspaceId });
      const result = await fetchJson<{
        destinations: TransferDestination[];
      }>(`/api/workspace/iam/resources/transfer?${params}`);
      setTransferDestinations(result.destinations);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("transferLoadFailed"));
      setTransferResource(null);
    } finally {
      setTransferLoading(false);
    }
  }

  async function previewTransfer() {
    if (!transferResource || !targetWorkspaceId) return;
    setTransferLoading(true);
    setTransferPreview(null);
    try {
      setTransferPreview(
        await fetchJson<ResourceTransferPreview>("/api/workspace/iam/resources/transfer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "preview",
            sourceWorkspaceId: workspaceId,
            targetWorkspaceId,
            resourceType: transferResource.type,
            resourceId: transferResource.id,
            options: transferOptions,
          }),
        }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("transferPreviewFailed"));
    } finally {
      setTransferLoading(false);
    }
  }

  async function executeTransfer() {
    if (!transferResource || !targetWorkspaceId || !transferPreview) return;
    setTransferLoading(true);
    try {
      await fetchJson("/api/workspace/iam/resources/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "execute",
          sourceWorkspaceId: workspaceId,
          targetWorkspaceId,
          resourceType: transferResource.type,
          resourceId: transferResource.id,
          options: transferOptions,
          confirmationToken: transferPreview.confirmationToken,
        }),
      });
      toast.success(
        t("transferCompleted", {
          count: transferPreview.items.length,
          project: transferPreview.destination.workspaceName,
        }),
      );
      setTransferResource(null);
      setTransferPreview(null);
      await loadResources();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("transferFailed"));
      setTransferPreview(null);
    } finally {
      setTransferLoading(false);
    }
  }
  return { transferResource, setTransferResource, transferDestinations, destinationQuery, setDestinationQuery, targetWorkspaceId, setTargetWorkspaceId, transferOptions, setTransferOptions, transferPreview, setTransferPreview, transferLoading, advancedTransfer, setAdvancedTransfer, openTransfer, previewTransfer, executeTransfer };
}
