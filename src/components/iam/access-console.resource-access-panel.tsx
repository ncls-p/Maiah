"use client";

import { useTranslations } from "next-intl";
import { type FormEvent,useCallback,useEffect,useMemo,useState } from "react";
import { toast } from "sonner";

import { fetchJson } from "@/lib/api-client";
import { AccessAssignment,AccessResource,AccessResourceDefinition,ResourceAccessSnapshot } from "./access-console.access-member";
import { ResourceAccessPanelView } from "./access-console.resource-access-panel.view";
import { ResourceTransferPreview } from "./access-console.resource-transfer-preview";
import { useResourceTransfer } from "./access-console.use-resource-transfer";

export function useResourceAccessPanelController({ workspaceId, organizationId, definitions, canManageResources }: { workspaceId: string; organizationId: string; definitions: AccessResourceDefinition[]; canManageResources: boolean }) {
  const t = useTranslations("access");
  const [resourceType, setResourceType] = useState(definitions[0]?.type ?? "agent");
  const [query, setQuery] = useState("");
  const [resources, setResources] = useState<AccessResource[]>([]);
  const [loadingResources, setLoadingResources] = useState(true);
  const [loadingMoreResources, setLoadingMoreResources] = useState(false);
  const [nextResourceOffset, setNextResourceOffset] = useState<number | null>(null);
  const [selected, setSelected] = useState<AccessResource | null>(null);
  const [details, setDetails] = useState<ResourceAccessSnapshot | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [principalType, setPrincipalType] = useState<"user" | "group">("user");
  const [principalId, setPrincipalId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [principalQuery, setPrincipalQuery] = useState("");
  const [assignmentQuery, setAssignmentQuery] = useState("");
  const [deletingResource, setDeletingResource] = useState<AccessResource | null>(null);
  const [deletionPending, setDeletionPending] = useState(false);

  const loadResources = useCallback(
    async (offset = 0) => {
      if (offset === 0) {
        setLoadingResources(true);
      } else {
        setLoadingMoreResources(true);
      }
      try {
        const params = new URLSearchParams({
          workspaceId,
          resourceType,
          search: query,
          limit: "50",
          offset: String(offset),
        });
        const result = await fetchJson<{
          resources: AccessResource[];
          nextOffset: number | null;
        }>(`/api/workspace/iam/resources?${params}`);
        setResources((current) => (offset === 0 ? result.resources : [...current, ...result.resources]));
        setNextResourceOffset(result.nextOffset);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("resourcesLoadFailed"));
      } finally {
        setLoadingResources(false);
        setLoadingMoreResources(false);
      }
    },
    [query, resourceType, t, workspaceId],
  );

  const loadDetails = useCallback(
    async (resource: AccessResource) => {
      setDetailsLoading(true);
      try {
        const params = new URLSearchParams({
          workspaceId,
          resourceType: resource.type,
          resourceId: resource.id,
        });
        setDetails(await fetchJson<ResourceAccessSnapshot>(`/api/workspace/iam/resources?${params}`));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("resourcesLoadFailed"));
      } finally {
        setDetailsLoading(false);
      }
    },
    [t, workspaceId],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadResources(), 250);
    return () => window.clearTimeout(timeout);
  }, [loadResources]);

  const principals = principalType === "user" ? (details?.members ?? []) : (details?.teams ?? []);
  const filteredPrincipals = principals.filter((principal) => [principal.name, "email" in principal ? principal.email : ""].some((value) => value.toLocaleLowerCase().includes(principalQuery.trim().toLocaleLowerCase())));
  const groupedAssignments = useMemo(() => {
    const groups = new Map<
      string,
      {
        principalName: string;
        principalDetail?: string;
        assignments: AccessAssignment[];
      }
    >();
    for (const assignment of details?.assignments ?? []) {
      const key = `${assignment.principalType}:${assignment.principalId}`;
      const group = groups.get(key);
      if (group) {
        group.assignments.push(assignment);
      } else {
        groups.set(key, {
          principalName: assignment.principalName,
          principalDetail: assignment.principalDetail,
          assignments: [assignment],
        });
      }
    }
    return [...groups.entries()];
  }, [details]);
  const filteredGroupedAssignments = useMemo(() => {
    const normalizedQuery = assignmentQuery.trim().toLocaleLowerCase();
    if (!normalizedQuery) return groupedAssignments;
    return groupedAssignments.filter(([, group]) => [group.principalName, group.principalDetail ?? "", ...group.assignments.flatMap((assignment) => [assignment.roleName, assignment.scope])].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)));
  }, [assignmentQuery, groupedAssignments]);
  const { transferResource, setTransferResource, transferDestinations, destinationQuery, setDestinationQuery, targetWorkspaceId, setTargetWorkspaceId, transferOptions, setTransferOptions, transferPreview, setTransferPreview, transferLoading, advancedTransfer, setAdvancedTransfer, openTransfer, previewTransfer, executeTransfer } = useResourceTransfer({ workspaceId, loadResources });

  const filteredDestinations = useMemo(() => {
    const normalizedQuery = destinationQuery.trim().toLocaleLowerCase();
    if (!normalizedQuery) return transferDestinations;
    return transferDestinations.filter((destination) => [destination.organizationName, destination.workspaceName].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)));
  }, [destinationQuery, transferDestinations]);
  const transferItemsByType = useMemo(() => {
    const groups = new Map<string, ResourceTransferPreview["items"]>();
    for (const item of transferPreview?.items ?? []) {
      groups.set(item.type, [...(groups.get(item.type) ?? []), item]);
    }
    return [...groups.entries()];
  }, [transferPreview]);

  async function assignResourceRole(event: FormEvent) {
    event.preventDefault();
    if (!selected || !principalId || !roleId) return;
    setPending("assign");
    try {
      await fetchJson("/api/workspace/iam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assignResourceRole",
          workspaceId,
          principalType,
          principalId,
          roleId,
          resourceType: selected.type,
          resourceId: selected.id,
        }),
      });
      toast.success(t("resourceAccessGranted"));
      setPrincipalId("");
      setRoleId("");
      await loadDetails(selected);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("mutationError"));
    } finally {
      setPending(null);
    }
  }

  async function removeResourceAssignment(bindingId: string) {
    if (!selected) return;
    setPending(bindingId);
    try {
      await fetchJson("/api/workspace/iam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "removeAssignment",
          workspaceId,
          bindingId,
        }),
      });
      toast.success(t("assignmentRemoved"));
      await loadDetails(selected);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("mutationError"));
    } finally {
      setPending(null);
    }
  }

  async function deleteResource() {
    if (!deletingResource) return;
    setDeletionPending(true);
    try {
      const params = new URLSearchParams({
        workspaceId,
        resourceType: deletingResource.type,
        resourceId: deletingResource.id,
      });
      await fetchJson(`/api/workspace/iam/resources?${params}`, {
        method: "DELETE",
      });
      toast.success(
        t("resourceDeleted", {
          name: deletingResource.name,
        }),
      );
      setResources((current) => current.filter(({ id }) => id !== deletingResource.id));
      if (selected?.id === deletingResource.id) {
        setSelected(null);
        setDetails(null);
      }
      if (transferResource?.id === deletingResource.id) {
        setTransferResource(null);
        setTransferPreview(null);
      }
      setDeletingResource(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("resourceDeleteFailed"));
    } finally {
      setDeletionPending(false);
    }
  }

  return {
    kind: "ready",
    advancedTransfer,
    assignResourceRole,
    assignmentQuery,
    canManageResources,
    definitions,
    deleteResource,
    deletingResource,
    deletionPending,
    destinationQuery,
    details,
    detailsLoading,
    executeTransfer,
    filteredDestinations,
    filteredGroupedAssignments,
    filteredPrincipals,
    loadDetails,
    loadResources,
    loadingMoreResources,
    loadingResources,
    nextResourceOffset,
    openTransfer,
    organizationId,
    pending,
    previewTransfer,
    principalId,
    principalQuery,
    principalType,
    query,
    removeResourceAssignment,
    resourceType,
    resources,
    roleId,
    selected,
    setAdvancedTransfer,
    setAssignmentQuery,
    setDeletingResource,
    setDestinationQuery,
    setDetails,
    setNextResourceOffset,
    setPrincipalId,
    setPrincipalQuery,
    setPrincipalType,
    setQuery,
    setResourceType,
    setResources,
    setRoleId,
    setSelected,
    setTargetWorkspaceId,
    setTransferOptions,
    setTransferPreview,
    setTransferResource,
    t,
    targetWorkspaceId,
    transferDestinations,
    transferItemsByType,
    transferLoading,
    transferOptions,
    transferPreview,
    transferResource,
    workspaceId,
  } as const;
}

export function ResourceAccessPanel(...args: Parameters<typeof useResourceAccessPanelController>) {
  const model = useResourceAccessPanelController(...args);
  if (!("kind" in model)) return model;
  return <ResourceAccessPanelView model={model} />;
}
