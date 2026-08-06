"use client";

import { useTranslations } from "next-intl";
import { useMemo,useState } from "react";
import { toast } from "sonner";

import { Destination,Mode,Preview,Scope,fetchJson } from "./scope-migration-dialog.scope";
import { ScopeMigrationDialogView } from "./scope-migration-dialog.scope-migration-dialog.view";

export function useScopeMigrationDialogController({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("access");
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("project");
  const [mode, setMode] = useState<Mode>("move");
  const [secretPolicy, setSecretPolicy] = useState<"keep" | "disable">("disable");
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [destinationId, setDestinationId] = useState("");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, setPending] = useState(false);

  const filteredDestinations = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return destinations;
    return destinations.filter((destination) => [destination.organizationName, destination.workspaceName].some((value) => value.toLocaleLowerCase().includes(normalized)));
  }, [destinations, query]);

  async function loadDestinations(nextScope: Scope = scope) {
    setPending(true);
    setPreview(null);
    setDestinationId("");
    try {
      const endpoint = nextScope === "project" ? "/api/workspace/iam/resources/transfer" : "/api/workspace/iam/organizations/transfer";
      const params = new URLSearchParams({ sourceWorkspaceId: workspaceId });
      const result = await fetchJson<{ destinations: Destination[] }>(`${endpoint}?${params}`);
      setDestinations(result.destinations);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("scopeMigrationLoadFailed"));
    } finally {
      setPending(false);
    }
  }

  function selectScope(nextScope: Scope) {
    setScope(nextScope);
    void loadDestinations(nextScope);
  }

  async function requestPreview() {
    const destination = destinations.find((item) => (scope === "project" ? item.workspaceId === destinationId : item.organizationId === destinationId));
    if (!destination) return;
    setPending(true);
    setPreview(null);
    try {
      const endpoint = scope === "project" ? "/api/workspace/iam/resources/transfer" : "/api/workspace/iam/organizations/transfer";
      const body =
        scope === "project"
          ? {
              action: "preview",
              mode,
              sourceWorkspaceId: workspaceId,
              targetWorkspaceId: destination.workspaceId,
              resourceType: "workspace",
              resourceId: workspaceId,
              options: {
                includeDependencies: true,
                accessPolicy: "compatible",
                ownershipPolicy: "preserve",
                secretPolicy,
              },
            }
          : {
              action: "preview",
              mode,
              sourceWorkspaceId: workspaceId,
              targetOrganizationId: destination.organizationId,
              secretPolicy,
            };
      setPreview(
        await fetchJson<Preview>(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("scopeMigrationPreviewFailed"));
    } finally {
      setPending(false);
    }
  }

  async function execute() {
    if (!preview) return;
    setPending(true);
    try {
      const endpoint = scope === "project" ? "/api/workspace/iam/resources/transfer" : "/api/workspace/iam/organizations/transfer";
      const body =
        scope === "project"
          ? {
              action: "execute",
              mode,
              sourceWorkspaceId: workspaceId,
              targetWorkspaceId: preview.destination.workspaceId,
              resourceType: "workspace",
              resourceId: workspaceId,
              options: {
                includeDependencies: true,
                accessPolicy: "compatible",
                ownershipPolicy: "preserve",
                secretPolicy,
              },
              confirmationToken: preview.confirmationToken,
            }
          : {
              action: "execute",
              mode,
              sourceWorkspaceId: workspaceId,
              targetOrganizationId: preview.destination.organizationId,
              secretPolicy,
              confirmationToken: preview.confirmationToken,
            };
      await fetchJson(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast.success(t("scopeMigrationCompleted"));
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("scopeMigrationFailed"));
      setPreview(null);
    } finally {
      setPending(false);
    }
  }

  const selectedDestination = destinations.find((destination) => (scope === "project" ? destination.workspaceId === destinationId : destination.organizationId === destinationId));
  const summaryEntries = preview?.counts
    ? Object.entries(preview.counts).filter(([, count]) => count > 0)
    : [
        ["resources", preview?.items?.length ?? 0],
        ["members", preview?.members?.moved ?? 0],
      ].filter(([, count]) => Number(count) > 0);

  return {
    kind: "ready",
    destinationId,
    destinations,
    execute,
    filteredDestinations,
    loadDestinations,
    mode,
    open,
    pending,
    preview,
    query,
    requestPreview,
    scope,
    secretPolicy,
    selectScope,
    selectedDestination,
    setDestinationId,
    setMode,
    setOpen,
    setPreview,
    setQuery,
    setSecretPolicy,
    summaryEntries,
    t,
  } as const;
}

export function ScopeMigrationDialog(...args: Parameters<typeof useScopeMigrationDialogController>) {
  const model = useScopeMigrationDialogController(...args);
  if (!("kind" in model)) return model;
  return <ScopeMigrationDialogView model={model} />;
}
