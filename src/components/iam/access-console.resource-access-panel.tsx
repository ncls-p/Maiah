"use client";

import { AlertTriangleIcon,ArrowRightLeftIcon,BoxesIcon,CheckIcon,ChevronRightIcon,FolderKanbanIcon,PlusIcon,SearchIcon,ShieldCheckIcon,Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent,useCallback,useEffect,useMemo,useState } from "react";
import { toast } from "sonner";

import { ScopeMigrationDialog } from "@/components/iam/scope-migration-dialog";
import { Alert,AlertDescription,AlertTitle } from "@/components/ui/alert";
import { AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogHeader,AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card,CardAction,CardContent,CardDescription,CardHeader,CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle } from "@/components/ui/dialog";
import { Empty,EmptyDescription,EmptyHeader,EmptyMedia,EmptyTitle } from "@/components/ui/empty";
import { Field,FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select,SelectContent,SelectGroup,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { fetchJson } from "@/lib/api-client";
import { AccessAssignment,AccessResource,AccessResourceDefinition,ResourceAccessSnapshot,TransferDestination } from "./access-console.access-member";
import { INITIAL_TRANSFER_OPTIONS,ResourceTransferOptions,ResourceTransferPreview } from "./access-console.resource-transfer-preview";

export function ResourceAccessPanel({ workspaceId, organizationId, definitions, canManageResources }: { workspaceId: string; organizationId: string; definitions: AccessResourceDefinition[]; canManageResources: boolean }) {
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
  const [transferResource, setTransferResource] = useState<AccessResource | null>(null);
  const [transferDestinations, setTransferDestinations] = useState<TransferDestination[]>([]);
  const [destinationQuery, setDestinationQuery] = useState("");
  const [targetWorkspaceId, setTargetWorkspaceId] = useState("");
  const [transferOptions, setTransferOptions] = useState<ResourceTransferOptions>(INITIAL_TRANSFER_OPTIONS);
  const [transferPreview, setTransferPreview] = useState<ResourceTransferPreview | null>(null);
  const [transferLoading, setTransferLoading] = useState(false);
  const [advancedTransfer, setAdvancedTransfer] = useState(false);
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("resourcesTitle")}</CardTitle>
        <CardDescription>{t("resourcesDescription")}</CardDescription>
        {canManageResources ? (
          <CardAction>
            <ScopeMigrationDialog workspaceId={workspaceId} />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-[15rem_minmax(16rem,1fr)]">
          <Field>
            <FieldLabel htmlFor="resource-type">{t("resourceType")}</FieldLabel>
            <Select
              value={resourceType}
              onValueChange={(value) => {
                setResourceType(value);
                setResources([]);
                setNextResourceOffset(null);
              }}
            >
              <SelectTrigger id="resource-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {definitions.map((definition) => (
                    <SelectItem key={definition.type} value={definition.type}>
                      {t(`resourceTypes.${definition.type}`)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="resource-search">{t("searchResources")}</FieldLabel>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input id="resource-search" className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchResourcesPlaceholder")} />
            </div>
          </Field>
        </div>

        {loadingResources ? (
          <div className="flex min-h-40 items-center justify-center">
            <Spinner />
            <span className="sr-only">{t("loadingResources")}</span>
          </div>
        ) : resources.length === 0 ? (
          <Empty className="min-h-48 border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BoxesIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>{t("noResources")}</EmptyTitle>
              <EmptyDescription>{t("noResourcesDescription")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-left">
              <thead className="bg-muted/45 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{t("resource")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {resources.map((resource) => (
                  <tr key={resource.id} className="hover:bg-muted/25">
                    <td className="px-4 py-3">
                      <span className="font-medium">{resource.name}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {canManageResources ? (
                          <Button type="button" size="sm" variant="ghost" onClick={() => void openTransfer(resource)}>
                            <ArrowRightLeftIcon data-icon="inline-start" aria-hidden="true" />
                            {t("transfer")}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelected(resource);
                            setDetails(null);
                            setPrincipalId("");
                            setRoleId("");
                            setAssignmentQuery("");
                            void loadDetails(resource);
                          }}
                        >
                          <ShieldCheckIcon data-icon="inline-start" aria-hidden="true" />
                          {t("manageResourceAccess")}
                        </Button>
                        {canManageResources ? (
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            aria-label={t("deleteResource", {
                              name: resource.name,
                            })}
                            onClick={() => setDeletingResource(resource)}
                          >
                            <Trash2Icon aria-hidden="true" />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {nextResourceOffset !== null ? (
              <div className="flex justify-center border-t bg-muted/15 p-3">
                <Button type="button" variant="outline" disabled={loadingMoreResources} onClick={() => void loadResources(nextResourceOffset)}>
                  {loadingMoreResources ? <Spinner data-icon="inline-start" /> : null}
                  {t("loadMoreResources")}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>

      <AlertDialog
        open={Boolean(deletingResource)}
        onOpenChange={(open) => {
          if (!open && !deletionPending) setDeletingResource(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deletingResource ? t("deleteResourceTitle", { name: deletingResource.name }) : t("deleteResourceFallbackTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteResourceDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletionPending}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletionPending}
              onClick={(event) => {
                event.preventDefault();
                void deleteResource();
              }}
            >
              {deletionPending ? <Spinner data-icon="inline-start" /> : <Trash2Icon data-icon="inline-start" aria-hidden="true" />}
              {deletionPending ? t("deletingResource") : t("confirmDeleteResource")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setDetails(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selected ? t("resourceAccessTitle", { name: selected.name }) : t("resourceAccess")}</DialogTitle>
            <DialogDescription>{t("resourceAccessDescription")}</DialogDescription>
          </DialogHeader>
          {detailsLoading || !details ? (
            <div className="flex min-h-48 items-center justify-center">
              <Spinner />
              <span className="sr-only">{t("loadingResources")}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {details.capabilities.canManageResourceAccess ? (
                <form className="grid gap-3 rounded-xl bg-muted/35 p-4 md:grid-cols-3" onSubmit={assignResourceRole}>
                  <Field>
                    <FieldLabel htmlFor="resource-principal-type">{t("principalType")}</FieldLabel>
                    <Select
                      value={principalType}
                      onValueChange={(value) => {
                        setPrincipalType(value as "user" | "group");
                        setPrincipalId("");
                      }}
                    >
                      <SelectTrigger id="resource-principal-type" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">{t("member")}</SelectItem>
                        <SelectItem value="group">{t("team")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="resource-principal">{t("principal")}</FieldLabel>
                    <Input value={principalQuery} onChange={(event) => setPrincipalQuery(event.target.value)} placeholder={t("searchPrincipal")} aria-label={t("searchPrincipal")} className="mb-2" />
                    <Select value={principalId} onValueChange={setPrincipalId}>
                      <SelectTrigger id="resource-principal" className="w-full">
                        <SelectValue placeholder={t("choose")} />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredPrincipals.map((principal) => (
                          <SelectItem key={principal.id} value={"userId" in principal ? principal.userId : principal.id}>
                            {principal.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="resource-role">{t("role")}</FieldLabel>
                    <Select value={roleId} onValueChange={setRoleId}>
                      <SelectTrigger id="resource-role" className="w-full">
                        <SelectValue placeholder={t("choose")} />
                      </SelectTrigger>
                      <SelectContent>
                        {details.roles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Button className="md:col-span-3 md:justify-self-end" type="submit" disabled={!principalId || !roleId || pending === "assign"}>
                    {pending === "assign" ? <Spinner data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" aria-hidden="true" />}
                    {t("grantResourceAccess")}
                  </Button>
                </form>
              ) : null}

              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input className="pl-9" value={assignmentQuery} onChange={(event) => setAssignmentQuery(event.target.value)} placeholder={t("searchResourceAccess")} aria-label={t("searchResourceAccess")} />
              </div>

              <div className="overflow-hidden rounded-xl border">
                <table className="w-full text-left">
                  <thead className="bg-muted/45 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">{t("principal")}</th>
                      <th className="px-4 py-3 font-medium">{t("role")}</th>
                      <th className="px-4 py-3 font-medium">{t("scope")}</th>
                      <th className="px-4 py-3 text-right font-medium">{t("actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredGroupedAssignments.map(([principalKey, group]) => (
                      <tr key={principalKey}>
                        <td className="px-4 py-3">
                          <div className="font-medium">{group.principalName}</div>
                          {group.principalDetail ? <div className="text-xs text-muted-foreground">{group.principalDetail}</div> : null}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {group.assignments.map((assignment) => (
                              <Badge key={assignment.id} variant="outline">
                                {assignment.roleName}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {group.assignments.map((assignment) => (
                              <Badge key={assignment.id} variant={assignment.scope === "resource" ? "default" : "secondary"}>
                                {assignment.scope === "resource" ? t("resourceScope") : assignment.scope === "organization" ? t("organizationScope") : t("projectScope")}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {group.assignments.some((assignment) => assignment.scope === "resource") && details.capabilities.canManageResourceAccess ? (
                            <div className="flex justify-end gap-1">
                              {group.assignments
                                .filter((assignment) => assignment.scope === "resource")
                                .map((assignment) => (
                                  <Button
                                    key={assignment.id}
                                    type="button"
                                    size="icon-sm"
                                    variant="ghost"
                                    aria-label={t("removeResourceRole", {
                                      role: assignment.roleName,
                                      name: assignment.principalName,
                                    })}
                                    disabled={pending === assignment.id}
                                    onClick={() => void removeResourceAssignment(assignment.id)}
                                  >
                                    {pending === assignment.id ? <Spinner /> : <Trash2Icon aria-hidden="true" />}
                                  </Button>
                                ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">{t("inherited")}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredGroupedAssignments.length === 0 ? (
                      <tr>
                        <td className="px-4 py-8 text-center text-sm text-muted-foreground" colSpan={4}>
                          {t("noResourceAccessResults")}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(transferResource)}
        onOpenChange={(open) => {
          if (!open && !transferLoading) {
            setTransferResource(null);
            setTransferPreview(null);
          }
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{transferResource ? t("transferTitle", { name: transferResource.name }) : t("transfer")}</DialogTitle>
            <DialogDescription>{t("transferDescription")}</DialogDescription>
          </DialogHeader>

          {transferLoading && transferDestinations.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center">
              <Spinner />
              <span className="sr-only">{t("loadingDestinations")}</span>
            </div>
          ) : transferDestinations.length === 0 ? (
            <Empty className="min-h-44 border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderKanbanIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>{t("noTransferDestination")}</EmptyTitle>
                <EmptyDescription>{t("noTransferDestinationDescription")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="grid gap-3 rounded-xl border bg-muted/20 p-4">
                <Field>
                  <FieldLabel htmlFor="transfer-destination-search">{t("destinationProject")}</FieldLabel>
                  <div className="relative">
                    <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input
                      id="transfer-destination-search"
                      className="pl-9"
                      value={destinationQuery}
                      onChange={(event) => {
                        setDestinationQuery(event.target.value);
                        setTransferPreview(null);
                      }}
                      placeholder={t("searchDestination")}
                    />
                  </div>
                  <Select
                    value={targetWorkspaceId}
                    onValueChange={(value) => {
                      setTargetWorkspaceId(value);
                      const destination = transferDestinations.find((candidate) => candidate.workspaceId === value);
                      const changesOrganization = destination?.organizationId !== organizationId;
                      setTransferOptions((current) => ({
                        ...current,
                        ownershipPolicy: changesOrganization ? "actor" : "preserve",
                        secretPolicy: changesOrganization ? "disable" : "keep",
                      }));
                      setTransferPreview(null);
                    }}
                  >
                    <SelectTrigger id="transfer-destination" className="w-full" aria-label={t("destinationProject")}>
                      <SelectValue placeholder={t("chooseDestination")} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredDestinations.map((destination) => (
                        <SelectItem key={destination.workspaceId} value={destination.workspaceId}>
                          {destination.organizationName} · {destination.workspaceName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-3">
                  <Checkbox
                    aria-label={t("includeDependencies")}
                    checked={transferOptions.includeDependencies}
                    onCheckedChange={(checked) => {
                      setTransferOptions((current) => ({
                        ...current,
                        includeDependencies: checked === true,
                      }));
                      setTransferPreview(null);
                    }}
                  />
                  <span className="grid gap-1">
                    <span className="text-sm font-medium">{t("includeDependencies")}</span>
                    <span className="text-xs text-muted-foreground">{t("includeDependenciesDescription")}</span>
                  </span>
                </label>

                <Button type="button" variant="ghost" className="justify-start" onClick={() => setAdvancedTransfer((value) => !value)}>
                  {advancedTransfer ? <ChevronRightIcon className="rotate-90" data-icon="inline-start" aria-hidden="true" /> : <ChevronRightIcon data-icon="inline-start" aria-hidden="true" />}
                  {t("advancedTransferOptions")}
                </Button>

                {advancedTransfer ? (
                  <div className="grid gap-3 border-t pt-4 md:grid-cols-3">
                    <Field>
                      <FieldLabel htmlFor="transfer-access-policy">{t("directAccessPolicy")}</FieldLabel>
                      <Select
                        value={transferOptions.accessPolicy}
                        onValueChange={(value) => {
                          setTransferOptions((current) => ({
                            ...current,
                            accessPolicy: value as ResourceTransferOptions["accessPolicy"],
                          }));
                          setTransferPreview(null);
                        }}
                      >
                        <SelectTrigger id="transfer-access-policy" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="compatible">{t("keepCompatibleAccess")}</SelectItem>
                          <SelectItem value="remove_all">{t("removeAllDirectAccess")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="transfer-ownership-policy">{t("ownershipPolicy")}</FieldLabel>
                      <Select
                        value={transferOptions.ownershipPolicy}
                        onValueChange={(value) => {
                          setTransferOptions((current) => ({
                            ...current,
                            ownershipPolicy: value as ResourceTransferOptions["ownershipPolicy"],
                          }));
                          setTransferPreview(null);
                        }}
                      >
                        <SelectTrigger id="transfer-ownership-policy" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="actor">{t("reassignOwnership")}</SelectItem>
                          <SelectItem value="preserve">{t("preserveOwnership")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="transfer-secret-policy">{t("secretPolicy")}</FieldLabel>
                      <Select
                        value={transferOptions.secretPolicy}
                        onValueChange={(value) => {
                          setTransferOptions((current) => ({
                            ...current,
                            secretPolicy: value as ResourceTransferOptions["secretPolicy"],
                          }));
                          setTransferPreview(null);
                        }}
                      >
                        <SelectTrigger id="transfer-secret-policy" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="disable">{t("disableSecrets")}</SelectItem>
                          <SelectItem value="keep">{t("keepSecrets")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                ) : null}
              </div>

              {transferPreview ? (
                <div className="flex flex-col gap-4">
                  <Alert variant={transferPreview.blockers.length > 0 ? "destructive" : "default"}>
                    {transferPreview.blockers.length > 0 ? <AlertTriangleIcon aria-hidden="true" /> : <CheckIcon aria-hidden="true" />}
                    <AlertTitle>
                      {transferPreview.blockers.length > 0
                        ? t("transferBlocked")
                        : t("transferReady", {
                            count: transferPreview.items.length,
                          })}
                    </AlertTitle>
                    <AlertDescription>{transferPreview.crossOrganization ? t("crossOrganizationTransfer") : t("sameOrganizationTransfer")}</AlertDescription>
                  </Alert>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">{t("resources")}</div>
                      <div className="text-xl font-semibold">{transferPreview.items.length}</div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">{t("directAssignments")}</div>
                      <div className="text-sm font-medium">
                        {t("keptAndRemoved", {
                          kept: transferPreview.directAssignments.kept,
                          removed: transferPreview.directAssignments.removed,
                        })}
                      </div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">{t("connections")}</div>
                      <div className="text-sm font-medium">
                        {t("affectedConnections", {
                          count: transferPreview.secrets.affected,
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="max-h-56 overflow-auto rounded-xl border">
                    <table className="w-full text-left">
                      <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 font-medium">{t("resourceType")}</th>
                          <th className="px-4 py-3 font-medium">{t("resource")}</th>
                          <th className="px-4 py-3 font-medium">{t("transferReason")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {transferItemsByType.flatMap(([type, items]) =>
                          items.map((item) => (
                            <tr key={`${item.type}:${item.id}`}>
                              <td className="px-4 py-3 text-sm">{t(`resourceTypes.${type}`)}</td>
                              <td className="px-4 py-3 text-sm font-medium">{item.name}</td>
                              <td className="px-4 py-3 text-sm text-muted-foreground">{t(`transferReasons.${item.reason}`)}</td>
                            </tr>
                          )),
                        )}
                      </tbody>
                    </table>
                  </div>

                  {[...transferPreview.blockers, ...transferPreview.warnings].length > 0 ? (
                    <ul className="grid gap-2 text-sm text-muted-foreground">
                      {transferPreview.blockers.map((message) => (
                        <li key={`blocker-${message}`} className="text-destructive">
                          • {message}
                        </li>
                      ))}
                      {transferPreview.warnings.map((message) => (
                        <li key={`warning-${message}`}>• {message}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}

          <DialogFooter className="sticky -bottom-6 z-10 -mx-6 -mb-6 border-t bg-background px-6 pt-4 pb-6">
            <Button
              type="button"
              variant="outline"
              disabled={transferLoading}
              onClick={() => {
                setTransferResource(null);
                setTransferPreview(null);
              }}
            >
              {t("cancelTransfer")}
            </Button>
            {transferPreview ? (
              <Button type="button" disabled={transferLoading || transferPreview.blockers.length > 0} onClick={() => void executeTransfer()}>
                {transferLoading ? <Spinner data-icon="inline-start" /> : <ArrowRightLeftIcon data-icon="inline-start" aria-hidden="true" />}
                {t("confirmTransfer")}
              </Button>
            ) : (
              <Button type="button" disabled={!targetWorkspaceId || transferLoading} onClick={() => void previewTransfer()}>
                {transferLoading ? <Spinner data-icon="inline-start" /> : null}
                {t("previewTransfer")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
