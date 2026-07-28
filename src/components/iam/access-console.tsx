"use client";

import {
  AlertTriangleIcon,
  ArrowRightLeftIcon,
  BoxesIcon,
  Building2Icon,
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  EllipsisIcon,
  FolderKanbanIcon,
  LockKeyholeIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
  ShieldIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchJson } from "@/lib/api-client";
import { buildAccessPeople } from "@/modules/iam/access-view-model";
import { isPermissionCompatibleWithScope } from "@/modules/iam/permission-catalog";

type AccessMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  status: "active" | "suspended" | "removed";
};

export type PlatformAccessUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  banReason: string | null;
  createdAt: string;
};

type AccessTeam = {
  id: string;
  name: string;
  description: string | null;
  members: Array<{
    id: string;
    userId: string;
    name: string;
    email: string;
  }>;
};

type AccessRole = {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  scopeType: "system" | "organization" | "workspace";
  isSystem: boolean;
  permissions: string[];
};

type AccessAssignment = {
  id: string;
  principalType: "user" | "team" | "service_account" | "api_key";
  principalId: string;
  principalName: string;
  principalDetail?: string;
  roleId: string;
  roleName: string;
  roleKey: string;
  scope: "organization" | "project" | "resource";
  inherited: boolean;
};

type PermissionGroup = {
  id: string;
  label: string;
  description: string;
  permissions: Array<{
    id: string;
    label: string;
    description: string;
  }>;
};

type AccessSnapshot = {
  organization: { id: string; name: string; slug: string };
  activeProject: { id: string; name: string; slug: string };
  projects: Array<{ id: string; name: string; slug: string }>;
  members: AccessMember[];
  teams: AccessTeam[];
  roles: AccessRole[];
  assignments: AccessAssignment[];
  permissionCatalog: PermissionGroup[];
  resourceDefinitions: AccessResourceDefinition[];
  effectivePermissions: string[];
  capabilities: {
    canManageProjectAccess: boolean;
    canManageOrganizationAccess: boolean;
    canCreateProjects: boolean;
    canManageMembers: boolean;
    canManageTeams: boolean;
  };
  canManageAccess: boolean;
};

type AccessResourceDefinition = {
  type: string;
  label: string;
  pluralLabel: string;
  permissionDomains: string[];
};

type AccessResource = {
  id: string;
  type: string;
  name: string;
};

type ResourceAccessSnapshot = {
  resource: AccessResource & {
    workspaceId: string;
    organizationId: string;
  };
  members: AccessMember[];
  teams: AccessTeam[];
  roles: AccessRole[];
  assignments: AccessAssignment[];
  capabilities: { canManageResourceAccess: boolean };
};

type TransferDestination = {
  workspaceId: string;
  workspaceName: string;
  organizationId: string;
  organizationName: string;
};

type ResourceTransferPreview = {
  source: TransferDestination;
  destination: TransferDestination;
  crossOrganization: boolean;
  items: Array<
    AccessResource & {
      reason: "selected" | "parent" | "dependency" | "dependent" | "history";
    }
  >;
  warnings: string[];
  blockers: string[];
  directAssignments: { kept: number; removed: number };
  secrets: { affected: number; policy: "keep" | "disable" };
  confirmationToken: string;
};

type ResourceTransferOptions = {
  includeDependencies: boolean;
  accessPolicy: "compatible" | "remove_all";
  ownershipPolicy: "preserve" | "actor";
  secretPolicy: "keep" | "disable";
};

type MutationPayload = Record<string, unknown> & { action: string };

const INITIAL_ORGANIZATION_FORM = {
  organizationName: "",
  projectName: "",
};
const INITIAL_PROJECT_FORM = { name: "" };
const INITIAL_TEAM_FORM = { name: "", description: "" };
const INITIAL_ROLE_FORM = {
  displayName: "",
  description: "",
  scopeType: "workspace" as "organization" | "workspace",
  permissions: [] as string[],
};
const INITIAL_ACCOUNT_FORM = {
  name: "",
  email: "",
  password: "",
  role: "user" as "user" | "admin",
};
const INITIAL_TRANSFER_OPTIONS: ResourceTransferOptions = {
  includeDependencies: true,
  accessPolicy: "compatible",
  ownershipPolicy: "preserve",
  secretPolicy: "keep",
};

const BUILT_IN_ROLE_KEYS = {
  "organization.owner": "owner",
  "organization.admin": "organizationAdmin",
  "organization.user": "organizationMember",
  "workspace.admin": "projectAdmin",
  "workspace.member": "projectEditor",
  "workspace.viewer": "projectViewer",
} as const;

function builtInRoleKey(roleName: string) {
  return BUILT_IN_ROLE_KEYS[roleName as keyof typeof BUILT_IN_ROLE_KEYS];
}

function AccessConsoleSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-11 w-full max-w-xl rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-52 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-52 rounded-2xl" />
      </div>
    </div>
  );
}

function InitialError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const t = useTranslations("access");
  return (
    <Empty className="min-h-80 border border-border/70 bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ShieldIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{t("loadFailed")}</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
      <Button type="button" variant="outline" onClick={onRetry}>
        <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
        {t("retry")}
      </Button>
    </Empty>
  );
}

function ResourceAccessPanel({
  workspaceId,
  organizationId,
  definitions,
  canManageResources,
}: {
  workspaceId: string;
  organizationId: string;
  definitions: AccessResourceDefinition[];
  canManageResources: boolean;
}) {
  const t = useTranslations("access");
  const [resourceType, setResourceType] = useState(
    definitions[0]?.type ?? "agent",
  );
  const [query, setQuery] = useState("");
  const [resources, setResources] = useState<AccessResource[]>([]);
  const [loadingResources, setLoadingResources] = useState(true);
  const [loadingMoreResources, setLoadingMoreResources] = useState(false);
  const [nextResourceOffset, setNextResourceOffset] = useState<number | null>(
    null,
  );
  const [selected, setSelected] = useState<AccessResource | null>(null);
  const [details, setDetails] = useState<ResourceAccessSnapshot | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [principalType, setPrincipalType] = useState<"user" | "group">("user");
  const [principalId, setPrincipalId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [principalQuery, setPrincipalQuery] = useState("");
  const [assignmentQuery, setAssignmentQuery] = useState("");
  const [transferResource, setTransferResource] =
    useState<AccessResource | null>(null);
  const [transferDestinations, setTransferDestinations] = useState<
    TransferDestination[]
  >([]);
  const [destinationQuery, setDestinationQuery] = useState("");
  const [targetWorkspaceId, setTargetWorkspaceId] = useState("");
  const [transferOptions, setTransferOptions] =
    useState<ResourceTransferOptions>(INITIAL_TRANSFER_OPTIONS);
  const [transferPreview, setTransferPreview] =
    useState<ResourceTransferPreview | null>(null);
  const [transferLoading, setTransferLoading] = useState(false);
  const [advancedTransfer, setAdvancedTransfer] = useState(false);
  const [deletingResource, setDeletingResource] =
    useState<AccessResource | null>(null);
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
        setResources((current) =>
          offset === 0 ? result.resources : [...current, ...result.resources],
        );
        setNextResourceOffset(result.nextOffset);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t("resourcesLoadFailed"),
        );
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
        setDetails(
          await fetchJson<ResourceAccessSnapshot>(
            `/api/workspace/iam/resources?${params}`,
          ),
        );
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t("resourcesLoadFailed"),
        );
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

  const principals =
    principalType === "user"
      ? (details?.members ?? [])
      : (details?.teams ?? []);
  const filteredPrincipals = principals.filter((principal) =>
    [principal.name, "email" in principal ? principal.email : ""].some(
      (value) =>
        value
          .toLocaleLowerCase()
          .includes(principalQuery.trim().toLocaleLowerCase()),
    ),
  );
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
    return groupedAssignments.filter(([, group]) =>
      [
        group.principalName,
        group.principalDetail ?? "",
        ...group.assignments.flatMap((assignment) => [
          assignment.roleName,
          assignment.scope,
        ]),
      ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
    );
  }, [assignmentQuery, groupedAssignments]);
  const filteredDestinations = useMemo(() => {
    const normalizedQuery = destinationQuery.trim().toLocaleLowerCase();
    if (!normalizedQuery) return transferDestinations;
    return transferDestinations.filter((destination) =>
      [destination.organizationName, destination.workspaceName].some((value) =>
        value.toLocaleLowerCase().includes(normalizedQuery),
      ),
    );
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
      toast.error(
        error instanceof Error ? error.message : t("transferLoadFailed"),
      );
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
        await fetchJson<ResourceTransferPreview>(
          "/api/workspace/iam/resources/transfer",
          {
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
          },
        ),
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("transferPreviewFailed"),
      );
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
      setResources((current) =>
        current.filter(({ id }) => id !== deletingResource.id),
      );
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
      toast.error(
        error instanceof Error ? error.message : t("resourceDeleteFailed"),
      );
    } finally {
      setDeletionPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("resourcesTitle")}</CardTitle>
        <CardDescription>{t("resourcesDescription")}</CardDescription>
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
            <FieldLabel htmlFor="resource-search">
              {t("searchResources")}
            </FieldLabel>
            <div className="relative">
              <SearchIcon
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="resource-search"
                className="pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("searchResourcesPlaceholder")}
              />
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
                  <th className="px-4 py-3 text-right font-medium">
                    {t("actions")}
                  </th>
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
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => void openTransfer(resource)}
                          >
                            <ArrowRightLeftIcon
                              data-icon="inline-start"
                              aria-hidden="true"
                            />
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
                          <ShieldCheckIcon
                            data-icon="inline-start"
                            aria-hidden="true"
                          />
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
                <Button
                  type="button"
                  variant="outline"
                  disabled={loadingMoreResources}
                  onClick={() => void loadResources(nextResourceOffset)}
                >
                  {loadingMoreResources ? (
                    <Spinner data-icon="inline-start" />
                  ) : null}
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
            <AlertDialogTitle>
              {deletingResource
                ? t("deleteResourceTitle", { name: deletingResource.name })
                : t("deleteResourceFallbackTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteResourceDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletionPending}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletionPending}
              onClick={(event) => {
                event.preventDefault();
                void deleteResource();
              }}
            >
              {deletionPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Trash2Icon data-icon="inline-start" aria-hidden="true" />
              )}
              {deletionPending
                ? t("deletingResource")
                : t("confirmDeleteResource")}
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
            <DialogTitle>
              {selected
                ? t("resourceAccessTitle", { name: selected.name })
                : t("resourceAccess")}
            </DialogTitle>
            <DialogDescription>
              {t("resourceAccessDescription")}
            </DialogDescription>
          </DialogHeader>
          {detailsLoading || !details ? (
            <div className="flex min-h-48 items-center justify-center">
              <Spinner />
              <span className="sr-only">{t("loadingResources")}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {details.capabilities.canManageResourceAccess ? (
                <form
                  className="grid gap-3 rounded-xl bg-muted/35 p-4 md:grid-cols-3"
                  onSubmit={assignResourceRole}
                >
                  <Field>
                    <FieldLabel htmlFor="resource-principal-type">
                      {t("principalType")}
                    </FieldLabel>
                    <Select
                      value={principalType}
                      onValueChange={(value) => {
                        setPrincipalType(value as "user" | "group");
                        setPrincipalId("");
                      }}
                    >
                      <SelectTrigger
                        id="resource-principal-type"
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">{t("member")}</SelectItem>
                        <SelectItem value="group">{t("team")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="resource-principal">
                      {t("principal")}
                    </FieldLabel>
                    <Input
                      value={principalQuery}
                      onChange={(event) =>
                        setPrincipalQuery(event.target.value)
                      }
                      placeholder={t("searchPrincipal")}
                      aria-label={t("searchPrincipal")}
                      className="mb-2"
                    />
                    <Select value={principalId} onValueChange={setPrincipalId}>
                      <SelectTrigger id="resource-principal" className="w-full">
                        <SelectValue placeholder={t("choose")} />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredPrincipals.map((principal) => (
                          <SelectItem
                            key={principal.id}
                            value={
                              "userId" in principal
                                ? principal.userId
                                : principal.id
                            }
                          >
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
                  <Button
                    className="md:col-span-3 md:justify-self-end"
                    type="submit"
                    disabled={!principalId || !roleId || pending === "assign"}
                  >
                    {pending === "assign" ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <PlusIcon data-icon="inline-start" aria-hidden="true" />
                    )}
                    {t("grantResourceAccess")}
                  </Button>
                </form>
              ) : null}

              <div className="relative">
                <SearchIcon
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  className="pl-9"
                  value={assignmentQuery}
                  onChange={(event) => setAssignmentQuery(event.target.value)}
                  placeholder={t("searchResourceAccess")}
                  aria-label={t("searchResourceAccess")}
                />
              </div>

              <div className="overflow-hidden rounded-xl border">
                <table className="w-full text-left">
                  <thead className="bg-muted/45 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">
                        {t("principal")}
                      </th>
                      <th className="px-4 py-3 font-medium">{t("role")}</th>
                      <th className="px-4 py-3 font-medium">{t("scope")}</th>
                      <th className="px-4 py-3 text-right font-medium">
                        {t("actions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredGroupedAssignments.map(([principalKey, group]) => (
                      <tr key={principalKey}>
                        <td className="px-4 py-3">
                          <div className="font-medium">
                            {group.principalName}
                          </div>
                          {group.principalDetail ? (
                            <div className="text-xs text-muted-foreground">
                              {group.principalDetail}
                            </div>
                          ) : null}
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
                              <Badge
                                key={assignment.id}
                                variant={
                                  assignment.scope === "resource"
                                    ? "default"
                                    : "secondary"
                                }
                              >
                                {assignment.scope === "resource"
                                  ? t("resourceScope")
                                  : assignment.scope === "organization"
                                    ? t("organizationScope")
                                    : t("projectScope")}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {group.assignments.some(
                            (assignment) => assignment.scope === "resource",
                          ) && details.capabilities.canManageResourceAccess ? (
                            <div className="flex justify-end gap-1">
                              {group.assignments
                                .filter(
                                  (assignment) =>
                                    assignment.scope === "resource",
                                )
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
                                    onClick={() =>
                                      void removeResourceAssignment(
                                        assignment.id,
                                      )
                                    }
                                  >
                                    {pending === assignment.id ? (
                                      <Spinner />
                                    ) : (
                                      <Trash2Icon aria-hidden="true" />
                                    )}
                                  </Button>
                                ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {t("inherited")}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredGroupedAssignments.length === 0 ? (
                      <tr>
                        <td
                          className="px-4 py-8 text-center text-sm text-muted-foreground"
                          colSpan={4}
                        >
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
            <DialogTitle>
              {transferResource
                ? t("transferTitle", { name: transferResource.name })
                : t("transfer")}
            </DialogTitle>
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
                <EmptyDescription>
                  {t("noTransferDestinationDescription")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="grid gap-3 rounded-xl border bg-muted/20 p-4">
                <Field>
                  <FieldLabel htmlFor="transfer-destination-search">
                    {t("destinationProject")}
                  </FieldLabel>
                  <div className="relative">
                    <SearchIcon
                      className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
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
                      const destination = transferDestinations.find(
                        (candidate) => candidate.workspaceId === value,
                      );
                      const changesOrganization =
                        destination?.organizationId !== organizationId;
                      setTransferOptions((current) => ({
                        ...current,
                        ownershipPolicy: changesOrganization
                          ? "actor"
                          : "preserve",
                        secretPolicy: changesOrganization ? "disable" : "keep",
                      }));
                      setTransferPreview(null);
                    }}
                  >
                    <SelectTrigger
                      id="transfer-destination"
                      className="w-full"
                      aria-label={t("destinationProject")}
                    >
                      <SelectValue placeholder={t("chooseDestination")} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredDestinations.map((destination) => (
                        <SelectItem
                          key={destination.workspaceId}
                          value={destination.workspaceId}
                        >
                          {destination.organizationName} ·{" "}
                          {destination.workspaceName}
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
                    <span className="text-sm font-medium">
                      {t("includeDependencies")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("includeDependenciesDescription")}
                    </span>
                  </span>
                </label>

                <Button
                  type="button"
                  variant="ghost"
                  className="justify-start"
                  onClick={() => setAdvancedTransfer((value) => !value)}
                >
                  {advancedTransfer ? (
                    <ChevronRightIcon
                      className="rotate-90"
                      data-icon="inline-start"
                      aria-hidden="true"
                    />
                  ) : (
                    <ChevronRightIcon
                      data-icon="inline-start"
                      aria-hidden="true"
                    />
                  )}
                  {t("advancedTransferOptions")}
                </Button>

                {advancedTransfer ? (
                  <div className="grid gap-3 border-t pt-4 md:grid-cols-3">
                    <Field>
                      <FieldLabel htmlFor="transfer-access-policy">
                        {t("directAccessPolicy")}
                      </FieldLabel>
                      <Select
                        value={transferOptions.accessPolicy}
                        onValueChange={(value) => {
                          setTransferOptions((current) => ({
                            ...current,
                            accessPolicy:
                              value as ResourceTransferOptions["accessPolicy"],
                          }));
                          setTransferPreview(null);
                        }}
                      >
                        <SelectTrigger
                          id="transfer-access-policy"
                          className="w-full"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="compatible">
                            {t("keepCompatibleAccess")}
                          </SelectItem>
                          <SelectItem value="remove_all">
                            {t("removeAllDirectAccess")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="transfer-ownership-policy">
                        {t("ownershipPolicy")}
                      </FieldLabel>
                      <Select
                        value={transferOptions.ownershipPolicy}
                        onValueChange={(value) => {
                          setTransferOptions((current) => ({
                            ...current,
                            ownershipPolicy:
                              value as ResourceTransferOptions["ownershipPolicy"],
                          }));
                          setTransferPreview(null);
                        }}
                      >
                        <SelectTrigger
                          id="transfer-ownership-policy"
                          className="w-full"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="actor">
                            {t("reassignOwnership")}
                          </SelectItem>
                          <SelectItem value="preserve">
                            {t("preserveOwnership")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="transfer-secret-policy">
                        {t("secretPolicy")}
                      </FieldLabel>
                      <Select
                        value={transferOptions.secretPolicy}
                        onValueChange={(value) => {
                          setTransferOptions((current) => ({
                            ...current,
                            secretPolicy:
                              value as ResourceTransferOptions["secretPolicy"],
                          }));
                          setTransferPreview(null);
                        }}
                      >
                        <SelectTrigger
                          id="transfer-secret-policy"
                          className="w-full"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="disable">
                            {t("disableSecrets")}
                          </SelectItem>
                          <SelectItem value="keep">
                            {t("keepSecrets")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                ) : null}
              </div>

              {transferPreview ? (
                <div className="flex flex-col gap-4">
                  <Alert
                    variant={
                      transferPreview.blockers.length > 0
                        ? "destructive"
                        : "default"
                    }
                  >
                    {transferPreview.blockers.length > 0 ? (
                      <AlertTriangleIcon aria-hidden="true" />
                    ) : (
                      <CheckIcon aria-hidden="true" />
                    )}
                    <AlertTitle>
                      {transferPreview.blockers.length > 0
                        ? t("transferBlocked")
                        : t("transferReady", {
                            count: transferPreview.items.length,
                          })}
                    </AlertTitle>
                    <AlertDescription>
                      {transferPreview.crossOrganization
                        ? t("crossOrganizationTransfer")
                        : t("sameOrganizationTransfer")}
                    </AlertDescription>
                  </Alert>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">
                        {t("resources")}
                      </div>
                      <div className="text-xl font-semibold">
                        {transferPreview.items.length}
                      </div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">
                        {t("directAssignments")}
                      </div>
                      <div className="text-sm font-medium">
                        {t("keptAndRemoved", {
                          kept: transferPreview.directAssignments.kept,
                          removed: transferPreview.directAssignments.removed,
                        })}
                      </div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">
                        {t("connections")}
                      </div>
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
                          <th className="px-4 py-3 font-medium">
                            {t("resourceType")}
                          </th>
                          <th className="px-4 py-3 font-medium">
                            {t("resource")}
                          </th>
                          <th className="px-4 py-3 font-medium">
                            {t("transferReason")}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {transferItemsByType.flatMap(([type, items]) =>
                          items.map((item) => (
                            <tr key={`${item.type}:${item.id}`}>
                              <td className="px-4 py-3 text-sm">
                                {t(`resourceTypes.${type}`)}
                              </td>
                              <td className="px-4 py-3 text-sm font-medium">
                                {item.name}
                              </td>
                              <td className="px-4 py-3 text-sm text-muted-foreground">
                                {t(`transferReasons.${item.reason}`)}
                              </td>
                            </tr>
                          )),
                        )}
                      </tbody>
                    </table>
                  </div>

                  {[...transferPreview.blockers, ...transferPreview.warnings]
                    .length > 0 ? (
                    <ul className="grid gap-2 text-sm text-muted-foreground">
                      {transferPreview.blockers.map((message) => (
                        <li
                          key={`blocker-${message}`}
                          className="text-destructive"
                        >
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
              <Button
                type="button"
                disabled={
                  transferLoading || transferPreview.blockers.length > 0
                }
                onClick={() => void executeTransfer()}
              >
                {transferLoading ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <ArrowRightLeftIcon
                    data-icon="inline-start"
                    aria-hidden="true"
                  />
                )}
                {t("confirmTransfer")}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={!targetWorkspaceId || transferLoading}
                onClick={() => void previewTransfer()}
              >
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

function ScopePath({ snapshot }: { snapshot: AccessSnapshot }) {
  const t = useTranslations("access");
  return (
    <Card className="bg-muted/25" size="sm">
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <Building2Icon aria-hidden="true" />
            <span className="truncate font-medium">
              {snapshot.organization.name}
            </span>
          </span>
          <ChevronRightIcon
            className="shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="flex min-w-0 items-center gap-2">
            <FolderKanbanIcon aria-hidden="true" />
            <span className="truncate font-medium">
              {snapshot.activeProject.name}
            </span>
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{t("inheritanceHint")}</p>
      </CardContent>
    </Card>
  );
}

function MutatingButton({
  pending,
  children,
}: {
  pending: boolean;
  children: ReactNode;
}) {
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <CheckIcon data-icon="inline-start" aria-hidden="true" />
      )}
      {children}
    </Button>
  );
}

function ConfirmRemovalButton({
  label,
  title,
  description,
  pending,
  onConfirm,
}: {
  label: string;
  title: string;
  description: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  const t = useTranslations("access");
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={pending}
        aria-label={label}
        onClick={() => setOpen(true)}
      >
        {pending ? <Spinner /> : <Trash2Icon aria-hidden="true" />}
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            {t("confirmRemove")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function AccessConsole({
  platformUsers,
  currentUserId,
}: {
  platformUsers?: PlatformAccessUser[];
  currentUserId?: string;
}) {
  const t = useTranslations("access");
  const roleLabel = (name: string, fallback: string) => {
    const key = builtInRoleKey(name);
    return key ? t(`builtInRoles.${key}`) : fallback;
  };
  const {
    workspaceId,
    setWorkspaceId,
    refresh: refreshWorkspaces,
  } = useWorkspace();
  const [snapshot, setSnapshot] = useState<AccessSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const [organizationOpen, setOrganizationOpen] = useState(false);
  const [organizationForm, setOrganizationForm] = useState(
    INITIAL_ORGANIZATION_FORM,
  );
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectForm, setProjectForm] = useState(INITIAL_PROJECT_FORM);
  const [memberOpen, setMemberOpen] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [teamOpen, setTeamOpen] = useState(false);
  const [teamForm, setTeamForm] = useState(INITIAL_TEAM_FORM);
  const [roleOpen, setRoleOpen] = useState(false);
  const [roleForm, setRoleForm] = useState(INITIAL_ROLE_FORM);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [bulkAssignmentIds, setBulkAssignmentIds] = useState<string[]>([]);
  const [assignment, setAssignment] = useState({
    principalType: "user" as "user" | "group",
    principalId: "",
    roleId: "",
    scopeType: "workspace" as "organization" | "workspace",
  });
  const [peopleQuery, setPeopleQuery] = useState("");
  const [assignmentPrincipalQuery, setAssignmentPrincipalQuery] = useState("");
  const [assignmentRoleQuery, setAssignmentRoleQuery] = useState("");
  const [teamQuery, setTeamQuery] = useState("");
  const [roleQuery, setRoleQuery] = useState("");
  const [permissionQuery, setPermissionQuery] = useState("");
  const [projectQuery, setProjectQuery] = useState("");
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [visiblePeopleCount, setVisiblePeopleCount] = useState(25);
  const [visibleTeamCount, setVisibleTeamCount] = useState(20);
  const [visibleRoleCount, setVisibleRoleCount] = useState(25);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleEditorReadOnly, setRoleEditorReadOnly] = useState(false);
  const [accountMode, setAccountMode] = useState<"existing" | "create">(
    "existing",
  );
  const [accountForm, setAccountForm] = useState(INITIAL_ACCOUNT_FORM);
  const [platformAccounts, setPlatformAccounts] = useState(platformUsers ?? []);
  const [busyPlatformUserId, setBusyPlatformUserId] = useState<string | null>(
    null,
  );

  const load = useCallback(
    async (options?: { preserveData?: boolean }) => {
      if (!workspaceId) return;
      if (!options?.preserveData) setLoading(true);
      setRefreshError(null);
      try {
        const data = await fetchJson<AccessSnapshot>(
          `/api/workspace/iam?workspaceId=${workspaceId}`,
        );
        setSnapshot(data);
      } catch (error) {
        const message = error instanceof Error ? error.message : t("loadError");
        setRefreshError(message);
      } finally {
        setLoading(false);
      }
    },
    [t, workspaceId],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- request lifecycle starts after the active project is known
    void load();
  }, [load]);

  async function mutate(
    key: string,
    payload: MutationPayload,
    successMessage: string,
    options?: { close?: () => void; nextWorkspaceId?: string },
  ) {
    setPendingAction(key);
    try {
      const result = await fetchJson<{ project?: { id: string } }>(
        "/api/workspace/iam",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      toast.success(successMessage);
      options?.close?.();
      await refreshWorkspaces();
      const nextWorkspaceId = options?.nextWorkspaceId ?? result.project?.id;
      if (nextWorkspaceId) {
        setWorkspaceId(nextWorkspaceId);
      } else {
        await load({ preserveData: true });
      }
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("mutationError"));
      return false;
    } finally {
      setPendingAction(null);
    }
  }

  const activeMembers = useMemo(
    () =>
      snapshot?.members.filter((member) => member.status === "active") ?? [],
    [snapshot],
  );
  const scopedRoles = useMemo(
    () =>
      snapshot?.roles.filter(
        (role) =>
          role.scopeType === assignment.scopeType &&
          [role.displayName, role.name, ...role.permissions].some((value) =>
            value
              .toLocaleLowerCase()
              .includes(assignmentRoleQuery.trim().toLocaleLowerCase()),
          ),
      ) ?? [],
    [assignment.scopeType, assignmentRoleQuery, snapshot],
  );
  const principalOptions = (
    assignment.principalType === "user"
      ? activeMembers
      : (snapshot?.teams ?? [])
  ).filter((principal) =>
    [
      "name" in principal ? principal.name : "",
      "email" in principal ? principal.email : "",
    ]
      .filter(Boolean)
      .some((value) =>
        value
          .toLocaleLowerCase()
          .includes(assignmentPrincipalQuery.trim().toLocaleLowerCase()),
      ),
  );

  async function refreshPlatformAccounts() {
    if (!platformUsers) return;
    const result = await fetchJson<{ users: PlatformAccessUser[] }>(
      "/api/admin/users",
    );
    setPlatformAccounts(result.users);
  }

  async function updatePlatformAccount(
    userId: string,
    payload: { role?: "user" | "admin"; banned?: boolean },
  ) {
    setBusyPlatformUserId(userId);
    try {
      await fetchJson(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await refreshPlatformAccounts();
      toast.success(t("accountUpdated"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("mutationError"));
    } finally {
      setBusyPlatformUserId(null);
    }
  }

  const snapshotIsCurrent = snapshot?.activeProject.id === workspaceId;
  if (!snapshotIsCurrent && (loading || !refreshError)) {
    return <AccessConsoleSkeleton />;
  }
  if (!snapshot || !snapshotIsCurrent) {
    return (
      <InitialError
        message={refreshError ?? t("loadError")}
        onRetry={() => void load()}
      />
    );
  }

  const {
    canManageProjectAccess,
    canManageOrganizationAccess,
    canCreateProjects,
    canManageMembers,
    canManageTeams,
  } = snapshot.capabilities;
  const canManageAnything =
    snapshot.canManageAccess ||
    canCreateProjects ||
    canManageMembers ||
    canManageTeams;
  const canCustomizeViewedRole =
    roleForm.scopeType === "organization"
      ? canManageOrganizationAccess
      : canManageProjectAccess;
  const accessPeople = buildAccessPeople({
    members: activeMembers,
    accounts: platformAccounts,
    assignments: snapshot.assignments,
    teams: snapshot.teams,
  });
  const normalizedPeopleQuery = peopleQuery.trim().toLocaleLowerCase();
  const people = accessPeople.filter((person) => {
    if (!normalizedPeopleQuery) return true;
    return [
      person.name,
      person.email,
      person.platformRole,
      ...person.assignments.flatMap((access) => [
        roleLabel(access.roleKey, access.roleName),
        access.scope,
      ]),
      ...person.teams.map((team) => team.name),
    ].some((value) =>
      value?.toLocaleLowerCase().includes(normalizedPeopleQuery),
    );
  });
  const visiblePeople = people.slice(0, visiblePeopleCount);
  const selectedVisiblePeople = visiblePeople.filter(
    (person) => person.memberStatus === "active",
  );
  const allVisiblePeopleSelected =
    selectedVisiblePeople.length > 0 &&
    selectedVisiblePeople.every((person) =>
      selectedPeople.includes(person.userId),
    );

  const normalizedTeamQuery = teamQuery.trim().toLocaleLowerCase();
  const filteredTeams = snapshot.teams.filter((team) =>
    [team.name, team.description, ...team.members.map((member) => member.name)]
      .filter(Boolean)
      .some((value) =>
        value?.toLocaleLowerCase().includes(normalizedTeamQuery),
      ),
  );
  const normalizedRoleQuery = roleQuery.trim().toLocaleLowerCase();
  const filteredRoles = snapshot.roles
    .filter((role) => role.scopeType !== "system")
    .filter((role) =>
      [
        roleLabel(role.name, role.displayName),
        role.description,
        role.scopeType,
        ...role.permissions,
      ]
        .filter(Boolean)
        .some((value) =>
          value?.toLocaleLowerCase().includes(normalizedRoleQuery),
        ),
    );
  const filteredProjects = snapshot.projects.filter(
    (project) =>
      project.id === workspaceId ||
      [project.name, project.slug].some((value) =>
        value
          .toLocaleLowerCase()
          .includes(projectQuery.trim().toLocaleLowerCase()),
      ),
  );

  return (
    <div className="flex flex-col gap-5">
      {refreshError ? (
        <Alert variant="destructive">
          <ShieldIcon aria-hidden="true" />
          <AlertTitle>{t("refreshFailed")}</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{refreshError}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void load({ preserveData: true })}
            >
              <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
              {t("retry")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <ScopePath snapshot={snapshot} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid w-full max-w-2xl gap-2 sm:grid-cols-[minmax(12rem,1fr)_minmax(14rem,1.4fr)] sm:items-end">
          <Field>
            <FieldLabel htmlFor="project-search">
              {t("searchProjects")}
            </FieldLabel>
            <div className="relative">
              <SearchIcon
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="project-search"
                className="pl-9"
                value={projectQuery}
                placeholder={t("searchPlaceholder")}
                onChange={(event) => setProjectQuery(event.target.value)}
              />
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="access-project">
              {t("activeProject")}
            </FieldLabel>
            <Select value={workspaceId ?? ""} onValueChange={setWorkspaceId}>
              <SelectTrigger id="access-project" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {filteredProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Dialog open={organizationOpen} onOpenChange={setOrganizationOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline">
                <Building2Icon data-icon="inline-start" aria-hidden="true" />
                {t("newOrganization")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("createOrganizationTitle")}</DialogTitle>
                <DialogDescription>
                  {t("createOrganizationDescription")}
                </DialogDescription>
              </DialogHeader>
              <form
                className="contents"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const created = await mutate(
                    "createOrganization",
                    {
                      action: "createOrganization",
                      ...organizationForm,
                    },
                    t("organizationCreated"),
                    { close: () => setOrganizationOpen(false) },
                  );
                  if (created) setOrganizationForm(INITIAL_ORGANIZATION_FORM);
                }}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="organization-name">
                      {t("organizationName")}
                    </FieldLabel>
                    <Input
                      id="organization-name"
                      required
                      minLength={2}
                      value={organizationForm.organizationName}
                      onChange={(event) =>
                        setOrganizationForm((current) => ({
                          ...current,
                          organizationName: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="first-project-name">
                      {t("firstProjectName")}
                    </FieldLabel>
                    <Input
                      id="first-project-name"
                      required
                      minLength={2}
                      value={organizationForm.projectName}
                      onChange={(event) =>
                        setOrganizationForm((current) => ({
                          ...current,
                          projectName: event.target.value,
                        }))
                      }
                    />
                  </Field>
                </FieldGroup>
                <DialogFooter>
                  <MutatingButton
                    pending={pendingAction === "createOrganization"}
                  >
                    {t("createOrganization")}
                  </MutatingButton>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {canCreateProjects ? (
            <Dialog open={projectOpen} onOpenChange={setProjectOpen}>
              <DialogTrigger asChild>
                <Button type="button">
                  <PlusIcon data-icon="inline-start" aria-hidden="true" />
                  {t("newProject")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("createProjectTitle")}</DialogTitle>
                  <DialogDescription>
                    {t("createProjectDescription", {
                      organization: snapshot.organization.name,
                    })}
                  </DialogDescription>
                </DialogHeader>
                <form
                  className="contents"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const created = await mutate(
                      "createProject",
                      {
                        action: "createProject",
                        workspaceId,
                        ...projectForm,
                      },
                      t("projectCreated"),
                      { close: () => setProjectOpen(false) },
                    );
                    if (created) setProjectForm(INITIAL_PROJECT_FORM);
                  }}
                >
                  <Field>
                    <FieldLabel htmlFor="project-name">
                      {t("projectName")}
                    </FieldLabel>
                    <Input
                      id="project-name"
                      required
                      minLength={2}
                      value={projectForm.name}
                      onChange={(event) =>
                        setProjectForm({ name: event.target.value })
                      }
                    />
                  </Field>
                  <DialogFooter>
                    <MutatingButton pending={pendingAction === "createProject"}>
                      {t("createProject")}
                    </MutatingButton>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </div>

      {!canManageAnything ? (
        <Alert>
          <ShieldCheckIcon aria-hidden="true" />
          <AlertTitle>{t("readOnlyTitle")}</AlertTitle>
          <AlertDescription>{t("readOnlyDescription")}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="access">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="access">
            <UsersIcon data-icon="inline-start" aria-hidden="true" />
            {t("tabs.people")}
          </TabsTrigger>
          <TabsTrigger value="resources">
            <BoxesIcon data-icon="inline-start" aria-hidden="true" />
            {t("tabs.resources")}
          </TabsTrigger>
          <TabsTrigger value="teams">{t("tabs.teams")}</TabsTrigger>
          <TabsTrigger value="roles">{t("tabs.roles")}</TabsTrigger>
        </TabsList>

        <TabsContent value="access" className="flex flex-col gap-4">
          <Card>
            <CardHeader className="grid-cols-1! lg:grid-cols-[1fr_auto]!">
              <CardTitle>{t("assignmentsTitle")}</CardTitle>
              <CardDescription>{t("assignmentsDescription")}</CardDescription>
              {canManageMembers ||
              canManageProjectAccess ||
              canManageOrganizationAccess ? (
                <CardAction className="col-start-1 row-start-3 row-span-1 mt-2 flex-wrap justify-self-start lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:mt-0 lg:justify-self-end">
                  {canManageMembers ? (
                    <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
                      <DialogTrigger asChild>
                        <Button type="button" size="sm" variant="outline">
                          <UserPlusIcon
                            data-icon="inline-start"
                            aria-hidden="true"
                          />
                          {t("addPerson")}
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                          <DialogTitle>{t("addPersonTitle")}</DialogTitle>
                          <DialogDescription>
                            {t("addPersonDescription")}
                          </DialogDescription>
                        </DialogHeader>
                        {platformUsers ? (
                          <Tabs
                            value={accountMode}
                            onValueChange={(value) =>
                              setAccountMode(value as "existing" | "create")
                            }
                          >
                            <TabsList className="w-full">
                              <TabsTrigger value="existing">
                                {t("existingAccount")}
                              </TabsTrigger>
                              <TabsTrigger value="create">
                                {t("createAccount")}
                              </TabsTrigger>
                            </TabsList>
                            <TabsContent value="existing">
                              <form
                                className="flex flex-col gap-5"
                                onSubmit={async (event) => {
                                  event.preventDefault();
                                  const saved = await mutate(
                                    "addMember",
                                    {
                                      action: "addMember",
                                      workspaceId,
                                      email: memberEmail,
                                    },
                                    t("memberAdded"),
                                    {
                                      close: () => setMemberOpen(false),
                                    },
                                  );
                                  if (saved) setMemberEmail("");
                                }}
                              >
                                <Field>
                                  <FieldLabel htmlFor="member-email">
                                    {t("email")}
                                  </FieldLabel>
                                  <Input
                                    id="member-email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    value={memberEmail}
                                    onChange={(event) =>
                                      setMemberEmail(event.target.value)
                                    }
                                  />
                                </Field>
                                <DialogFooter>
                                  <MutatingButton
                                    pending={pendingAction === "addMember"}
                                  >
                                    {t("addToOrganization")}
                                  </MutatingButton>
                                </DialogFooter>
                              </form>
                            </TabsContent>
                            <TabsContent value="create">
                              <form
                                className="flex flex-col gap-5"
                                onSubmit={async (event) => {
                                  event.preventDefault();
                                  setPendingAction("createAccount");
                                  try {
                                    await fetchJson("/api/admin/users", {
                                      method: "POST",
                                      headers: {
                                        "Content-Type": "application/json",
                                      },
                                      body: JSON.stringify(accountForm),
                                    });
                                    await fetchJson("/api/workspace/iam", {
                                      method: "POST",
                                      headers: {
                                        "Content-Type": "application/json",
                                      },
                                      body: JSON.stringify({
                                        action: "addMember",
                                        workspaceId,
                                        email: accountForm.email,
                                      }),
                                    });
                                    await Promise.all([
                                      refreshPlatformAccounts(),
                                      load({ preserveData: true }),
                                      refreshWorkspaces(),
                                    ]);
                                    setAccountForm(INITIAL_ACCOUNT_FORM);
                                    setMemberOpen(false);
                                    toast.success(t("accountAndMemberCreated"));
                                  } catch (error) {
                                    toast.error(
                                      error instanceof Error
                                        ? error.message
                                        : t("mutationError"),
                                    );
                                  } finally {
                                    setPendingAction(null);
                                  }
                                }}
                              >
                                <FieldGroup>
                                  <Field>
                                    <FieldLabel htmlFor="account-name">
                                      {t("name")}
                                    </FieldLabel>
                                    <Input
                                      id="account-name"
                                      autoComplete="name"
                                      required
                                      value={accountForm.name}
                                      onChange={(event) =>
                                        setAccountForm({
                                          ...accountForm,
                                          name: event.target.value,
                                        })
                                      }
                                    />
                                  </Field>
                                  <Field>
                                    <FieldLabel htmlFor="account-email">
                                      {t("email")}
                                    </FieldLabel>
                                    <Input
                                      id="account-email"
                                      type="email"
                                      autoComplete="email"
                                      required
                                      value={accountForm.email}
                                      onChange={(event) =>
                                        setAccountForm({
                                          ...accountForm,
                                          email: event.target.value,
                                        })
                                      }
                                    />
                                  </Field>
                                  <Field>
                                    <FieldLabel htmlFor="account-password">
                                      {t("temporaryPassword")}
                                    </FieldLabel>
                                    <Input
                                      id="account-password"
                                      type="password"
                                      autoComplete="new-password"
                                      required
                                      minLength={8}
                                      value={accountForm.password}
                                      onChange={(event) =>
                                        setAccountForm({
                                          ...accountForm,
                                          password: event.target.value,
                                        })
                                      }
                                    />
                                  </Field>
                                  <Field>
                                    <FieldLabel htmlFor="account-role">
                                      {t("appRole")}
                                    </FieldLabel>
                                    <Select
                                      value={accountForm.role}
                                      onValueChange={(value) =>
                                        setAccountForm({
                                          ...accountForm,
                                          role: value as "user" | "admin",
                                        })
                                      }
                                    >
                                      <SelectTrigger
                                        id="account-role"
                                        className="w-full"
                                      >
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="user">
                                          {t("standardAccount")}
                                        </SelectItem>
                                        <SelectItem value="admin">
                                          {t("appAdministrator")}
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </Field>
                                </FieldGroup>
                                <DialogFooter>
                                  <MutatingButton
                                    pending={pendingAction === "createAccount"}
                                  >
                                    {t("createAndAdd")}
                                  </MutatingButton>
                                </DialogFooter>
                              </form>
                            </TabsContent>
                          </Tabs>
                        ) : (
                          <form
                            className="flex flex-col gap-5"
                            onSubmit={async (event) => {
                              event.preventDefault();
                              const saved = await mutate(
                                "addMember",
                                {
                                  action: "addMember",
                                  workspaceId,
                                  email: memberEmail,
                                },
                                t("memberAdded"),
                                { close: () => setMemberOpen(false) },
                              );
                              if (saved) setMemberEmail("");
                            }}
                          >
                            <Field>
                              <FieldLabel htmlFor="member-email">
                                {t("email")}
                              </FieldLabel>
                              <Input
                                id="member-email"
                                type="email"
                                autoComplete="email"
                                required
                                value={memberEmail}
                                onChange={(event) =>
                                  setMemberEmail(event.target.value)
                                }
                              />
                            </Field>
                            <DialogFooter>
                              <MutatingButton
                                pending={pendingAction === "addMember"}
                              >
                                {t("addToOrganization")}
                              </MutatingButton>
                            </DialogFooter>
                          </form>
                        )}
                      </DialogContent>
                    </Dialog>
                  ) : null}
                  {canManageProjectAccess || canManageOrganizationAccess ? (
                    <Dialog
                      open={assignmentOpen}
                      onOpenChange={(open) => {
                        setAssignmentOpen(open);
                        if (!open) setBulkAssignmentIds([]);
                        if (open && !canManageOrganizationAccess) {
                          setAssignment((current) => ({
                            ...current,
                            scopeType: "workspace",
                            roleId: "",
                          }));
                        }
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            setBulkAssignmentIds([]);
                            setAssignment({
                              principalType: "user",
                              principalId: "",
                              roleId: "",
                              scopeType: "workspace",
                            });
                          }}
                        >
                          <PlusIcon
                            data-icon="inline-start"
                            aria-hidden="true"
                          />
                          {t("assignRole")}
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{t("assignRoleTitle")}</DialogTitle>
                          <DialogDescription>
                            {t("assignRoleDescription")}
                          </DialogDescription>
                        </DialogHeader>
                        <form
                          className="contents"
                          onSubmit={async (event) => {
                            event.preventDefault();
                            const saved = await mutate(
                              "assignRole",
                              bulkAssignmentIds.length > 0
                                ? {
                                    action: "assignRoleBulk",
                                    workspaceId,
                                    principalIds: bulkAssignmentIds,
                                    roleId: assignment.roleId,
                                    scopeType: assignment.scopeType,
                                  }
                                : {
                                    action: "assignRole",
                                    workspaceId,
                                    ...assignment,
                                  },
                              t("roleAssigned"),
                              { close: () => setAssignmentOpen(false) },
                            );
                            if (saved) {
                              setSelectedPeople([]);
                              setBulkAssignmentIds([]);
                              setAssignment({
                                principalType: "user",
                                principalId: "",
                                roleId: "",
                                scopeType: "workspace",
                              });
                            }
                          }}
                        >
                          <FieldGroup>
                            {bulkAssignmentIds.length === 0 ? (
                              <>
                                <Field>
                                  <FieldLabel htmlFor="assignment-scope">
                                    {t("scope")}
                                  </FieldLabel>
                                  <Select
                                    value={assignment.scopeType}
                                    onValueChange={(value) =>
                                      setAssignment({
                                        ...assignment,
                                        scopeType: value as
                                          | "organization"
                                          | "workspace",
                                        roleId: "",
                                      })
                                    }
                                  >
                                    <SelectTrigger
                                      id="assignment-scope"
                                      className="w-full"
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectGroup>
                                        <SelectItem value="workspace">
                                          {t("projectOnly")}
                                        </SelectItem>
                                        {canManageOrganizationAccess ? (
                                          <SelectItem value="organization">
                                            {t("wholeOrganization")}
                                          </SelectItem>
                                        ) : null}
                                      </SelectGroup>
                                    </SelectContent>
                                  </Select>
                                </Field>
                                <Field>
                                  <FieldLabel htmlFor="assignment-principal-type">
                                    {t("principalType")}
                                  </FieldLabel>
                                  <Select
                                    value={assignment.principalType}
                                    onValueChange={(value) =>
                                      setAssignment({
                                        ...assignment,
                                        principalType: value as
                                          | "user"
                                          | "group",
                                        principalId: "",
                                      })
                                    }
                                  >
                                    <SelectTrigger
                                      id="assignment-principal-type"
                                      className="w-full"
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectGroup>
                                        <SelectItem value="user">
                                          {t("member")}
                                        </SelectItem>
                                        <SelectItem value="group">
                                          {t("team")}
                                        </SelectItem>
                                      </SelectGroup>
                                    </SelectContent>
                                  </Select>
                                </Field>
                              </>
                            ) : (
                              <Alert>
                                <UsersIcon aria-hidden="true" />
                                <AlertTitle>
                                  {t("bulkGrantTitle", {
                                    count: bulkAssignmentIds.length,
                                  })}
                                </AlertTitle>
                                <AlertDescription>
                                  {t("bulkGrantDescription")}
                                </AlertDescription>
                              </Alert>
                            )}
                            <Field>
                              <FieldLabel htmlFor="assignment-principal">
                                {t("principal")}
                              </FieldLabel>
                              <Input
                                id="assignment-principal-search"
                                value={assignmentPrincipalQuery}
                                placeholder={t("searchPeople")}
                                aria-label={t("searchPrincipal")}
                                onChange={(event) =>
                                  setAssignmentPrincipalQuery(
                                    event.target.value,
                                  )
                                }
                              />
                              <Select
                                required
                                value={assignment.principalId}
                                onValueChange={(value) =>
                                  setAssignment({
                                    ...assignment,
                                    principalId: value,
                                  })
                                }
                              >
                                <SelectTrigger
                                  id="assignment-principal"
                                  className="w-full"
                                >
                                  <SelectValue placeholder={t("choose")} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    {principalOptions.map((principal) => (
                                      <SelectItem
                                        key={
                                          "userId" in principal
                                            ? principal.userId
                                            : principal.id
                                        }
                                        value={
                                          "userId" in principal
                                            ? principal.userId
                                            : principal.id
                                        }
                                      >
                                        {principal.name}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                            </Field>
                            <Field>
                              <FieldLabel htmlFor="assignment-role">
                                {t("role")}
                              </FieldLabel>
                              <Input
                                id="assignment-role-search"
                                value={assignmentRoleQuery}
                                placeholder={t("searchRoles")}
                                aria-label={t("searchRoles")}
                                onChange={(event) =>
                                  setAssignmentRoleQuery(event.target.value)
                                }
                              />
                              <Select
                                required
                                value={assignment.roleId}
                                onValueChange={(value) =>
                                  setAssignment({
                                    ...assignment,
                                    roleId: value,
                                  })
                                }
                              >
                                <SelectTrigger
                                  id="assignment-role"
                                  className="w-full"
                                >
                                  <SelectValue placeholder={t("choose")} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    {scopedRoles.map((role) => (
                                      <SelectItem key={role.id} value={role.id}>
                                        {roleLabel(role.name, role.displayName)}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                            </Field>
                          </FieldGroup>
                          <DialogFooter>
                            <MutatingButton
                              pending={pendingAction === "assignRole"}
                            >
                              {t("saveAssignment")}
                            </MutatingButton>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>
                  ) : null}
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-4 px-0">
              <div className="flex flex-col gap-3 px-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full max-w-md">
                  <SearchIcon
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="people-search"
                    className="pl-9"
                    value={peopleQuery}
                    placeholder={t("searchPeople")}
                    aria-label={t("searchPeople")}
                    onChange={(event) => {
                      setPeopleQuery(event.target.value);
                      setVisiblePeopleCount(25);
                    }}
                  />
                </div>
                {selectedPeople.length > 0 &&
                (canManageProjectAccess || canManageOrganizationAccess) ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {t("selectedCount", { count: selectedPeople.length })}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setBulkAssignmentIds(selectedPeople);
                        setAssignment({
                          principalType: "user",
                          principalId: "",
                          roleId: "",
                          scopeType: "workspace",
                        });
                        setAssignmentOpen(true);
                      }}
                    >
                      <ShieldCheckIcon
                        data-icon="inline-start"
                        aria-hidden="true"
                      />
                      {t("grantSelected")}
                    </Button>
                  </div>
                ) : null}
              </div>

              {people.length === 0 ? (
                <Empty className="min-h-52">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ShieldIcon aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle>
                      {peopleQuery ? t("noSearchResults") : t("noAssignments")}
                    </EmptyTitle>
                    <EmptyDescription>
                      {peopleQuery
                        ? t("noSearchResultsDescription")
                        : t("noAssignmentsDescription")}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="overflow-x-auto border-y border-border/60">
                  <table className="w-full min-w-[58rem] text-left">
                    <thead className="bg-muted/35 text-xs font-medium text-muted-foreground">
                      <tr>
                        <th className="w-12 px-6 py-3">
                          <Checkbox
                            id="select-visible-people"
                            aria-label={t("selectVisiblePeople")}
                            checked={allVisiblePeopleSelected}
                            onCheckedChange={(checked) =>
                              setSelectedPeople((current) => {
                                const visibleIds = selectedVisiblePeople.map(
                                  (person) => person.userId,
                                );
                                return checked
                                  ? [...new Set([...current, ...visibleIds])]
                                  : current.filter(
                                      (id) => !visibleIds.includes(id),
                                    );
                              })
                            }
                          />
                        </th>
                        <th className="px-3 py-3">{t("personColumn")}</th>
                        <th className="px-3 py-3">{t("accessColumn")}</th>
                        <th className="px-3 py-3">{t("teamsColumn")}</th>
                        <th className="w-14 px-6 py-3 text-right">
                          <span className="sr-only">{t("actions")}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {visiblePeople.map((person) => {
                        const isMember = person.memberStatus === "active";
                        const isCurrentUser = person.userId === currentUserId;
                        return (
                          <tr
                            key={person.userId}
                            className="align-top transition-colors hover:bg-muted/20"
                          >
                            <td className="px-6 py-4">
                              <Checkbox
                                id={`select-person-${person.userId}`}
                                aria-label={t("selectPerson", {
                                  name: person.name,
                                })}
                                disabled={!isMember}
                                checked={selectedPeople.includes(person.userId)}
                                onCheckedChange={(checked) =>
                                  setSelectedPeople((current) =>
                                    checked
                                      ? [
                                          ...new Set([
                                            ...current,
                                            person.userId,
                                          ]),
                                        ]
                                      : current.filter(
                                          (id) => id !== person.userId,
                                        ),
                                  )
                                }
                              />
                            </td>
                            <td className="px-3 py-4">
                              <div className="flex min-w-52 items-start gap-3">
                                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                  {person.name
                                    .split(/\s+/)
                                    .map((part) => part[0])
                                    .join("")
                                    .slice(0, 2)
                                    .toUpperCase() || "?"}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="font-medium">
                                      {person.name}
                                    </span>
                                    {isCurrentUser ? (
                                      <Badge variant="outline">
                                        {t("you")}
                                      </Badge>
                                    ) : null}
                                    {person.banned ? (
                                      <Badge variant="destructive">
                                        {t("suspended")}
                                      </Badge>
                                    ) : !isMember ? (
                                      <Badge variant="secondary">
                                        {t("accountOnly")}
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {person.email}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-4">
                              <div className="flex max-w-xl flex-wrap gap-1.5">
                                {person.platformRole === "admin" ? (
                                  <Badge>
                                    <LockKeyholeIcon aria-hidden="true" />
                                    {t("appAdministrator")}
                                  </Badge>
                                ) : null}
                                {person.assignments.map((item) => (
                                  <span
                                    key={item.id}
                                    className="inline-flex items-center"
                                  >
                                    <Badge
                                      variant={
                                        item.inherited ? "secondary" : "outline"
                                      }
                                      className="rounded-r-none border-r-0"
                                    >
                                      {roleLabel(item.roleKey, item.roleName)}
                                      <span className="text-[10px] opacity-70">
                                        ·{" "}
                                        {item.scope === "organization"
                                          ? t("organizationShort")
                                          : t("projectShort")}
                                      </span>
                                    </Badge>
                                    {(
                                      item.scope === "organization"
                                        ? canManageOrganizationAccess
                                        : canManageProjectAccess
                                    ) ? (
                                      <ConfirmRemovalButton
                                        pending={pendingAction === item.id}
                                        label={t("removeAssignment", {
                                          name: item.principalName,
                                        })}
                                        title={t("removeAssignmentTitle", {
                                          name: item.principalName,
                                        })}
                                        description={t(
                                          "removeAssignmentDescription",
                                          {
                                            role: roleLabel(
                                              item.roleKey,
                                              item.roleName,
                                            ),
                                            scope:
                                              item.scope === "organization"
                                                ? t("organizationScope")
                                                : t("projectScope"),
                                          },
                                        )}
                                        onConfirm={() =>
                                          void mutate(
                                            item.id,
                                            {
                                              action: "removeAssignment",
                                              workspaceId,
                                              bindingId: item.id,
                                            },
                                            t("assignmentRemoved"),
                                          )
                                        }
                                      />
                                    ) : null}
                                  </span>
                                ))}
                                {person.assignments.length === 0 &&
                                person.platformRole !== "admin" ? (
                                  <span className="text-xs text-muted-foreground">
                                    {isMember
                                      ? t("noExplicitAccess")
                                      : t("notInOrganization")}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-4">
                              <div className="flex max-w-xs flex-wrap gap-1">
                                {person.teams.length === 0 ? (
                                  <span className="text-xs text-muted-foreground">
                                    —
                                  </span>
                                ) : (
                                  person.teams.slice(0, 3).map((team) => (
                                    <Badge key={team.id} variant="outline">
                                      {team.name}
                                    </Badge>
                                  ))
                                )}
                                {person.teams.length > 3 ? (
                                  <Badge variant="secondary">
                                    +{person.teams.length - 3}
                                  </Badge>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="ghost"
                                    aria-label={t("personActions", {
                                      name: person.name,
                                    })}
                                    disabled={
                                      busyPlatformUserId === person.userId
                                    }
                                  >
                                    {busyPlatformUserId === person.userId ? (
                                      <Spinner />
                                    ) : (
                                      <EllipsisIcon aria-hidden="true" />
                                    )}
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="end"
                                  className="w-64"
                                >
                                  <DropdownMenuLabel>
                                    {person.name}
                                  </DropdownMenuLabel>
                                  {isMember &&
                                  (canManageProjectAccess ||
                                    canManageOrganizationAccess) ? (
                                    <DropdownMenuItem
                                      onSelect={() => {
                                        setBulkAssignmentIds([]);
                                        setAssignment({
                                          principalType: "user",
                                          principalId: person.userId,
                                          roleId: "",
                                          scopeType: "workspace",
                                        });
                                        setAssignmentOpen(true);
                                      }}
                                    >
                                      <ShieldCheckIcon aria-hidden="true" />
                                      {t("grantAccess")}
                                    </DropdownMenuItem>
                                  ) : null}
                                  {!isMember && canManageMembers ? (
                                    <DropdownMenuItem
                                      onSelect={() =>
                                        void mutate(
                                          `add-member-${person.userId}`,
                                          {
                                            action: "addMember",
                                            workspaceId,
                                            email: person.email,
                                          },
                                          t("memberAdded"),
                                        )
                                      }
                                    >
                                      <UserPlusIcon aria-hidden="true" />
                                      {t("addToOrganization")}
                                    </DropdownMenuItem>
                                  ) : null}
                                  {platformUsers ? (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        disabled={isCurrentUser}
                                        onSelect={() =>
                                          void updatePlatformAccount(
                                            person.userId,
                                            {
                                              role:
                                                person.platformRole === "admin"
                                                  ? "user"
                                                  : "admin",
                                            },
                                          )
                                        }
                                      >
                                        <LockKeyholeIcon aria-hidden="true" />
                                        {person.platformRole === "admin"
                                          ? t("removeAppAdmin")
                                          : t("makeAppAdmin")}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        variant={
                                          person.banned
                                            ? "default"
                                            : "destructive"
                                        }
                                        disabled={isCurrentUser}
                                        onSelect={() =>
                                          void updatePlatformAccount(
                                            person.userId,
                                            { banned: !person.banned },
                                          )
                                        }
                                      >
                                        {person.banned
                                          ? t("restoreAccount")
                                          : t("suspendAccount")}
                                      </DropdownMenuItem>
                                    </>
                                  ) : null}
                                  {isMember && canManageMembers ? (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        variant="destructive"
                                        disabled={isCurrentUser}
                                        onSelect={() =>
                                          void mutate(
                                            `remove-member-${person.userId}`,
                                            {
                                              action: "removeMember",
                                              workspaceId,
                                              userId: person.userId,
                                            },
                                            t("memberRemoved"),
                                          )
                                        }
                                      >
                                        <Trash2Icon aria-hidden="true" />
                                        {t("removeFromOrganization")}
                                      </DropdownMenuItem>
                                    </>
                                  ) : null}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {people.length > visiblePeople.length ? (
                <div className="flex justify-center px-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setVisiblePeopleCount((count) => count + 25)}
                  >
                    {t("showMore", {
                      count: Math.min(25, people.length - visiblePeople.length),
                    })}
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resources">
          <ResourceAccessPanel
            workspaceId={workspaceId}
            organizationId={snapshot.organization.id}
            definitions={snapshot.resourceDefinitions}
            canManageResources={snapshot.capabilities.canManageProjectAccess}
          />
        </TabsContent>

        <TabsContent value="teams">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{t("teamsTitle")}</CardTitle>
                <CardDescription>{t("teamsDescription")}</CardDescription>
                {canManageTeams ? (
                  <CardAction>
                    <Dialog open={teamOpen} onOpenChange={setTeamOpen}>
                      <DialogTrigger asChild>
                        <Button type="button" size="sm">
                          <PlusIcon
                            data-icon="inline-start"
                            aria-hidden="true"
                          />
                          {t("createTeam")}
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{t("createTeamTitle")}</DialogTitle>
                          <DialogDescription>
                            {t("createTeamDescription")}
                          </DialogDescription>
                        </DialogHeader>
                        <form
                          className="contents"
                          onSubmit={async (event) => {
                            event.preventDefault();
                            const saved = await mutate(
                              "createTeam",
                              {
                                action: "createTeam",
                                workspaceId,
                                ...teamForm,
                              },
                              t("teamCreated"),
                              { close: () => setTeamOpen(false) },
                            );
                            if (saved) setTeamForm(INITIAL_TEAM_FORM);
                          }}
                        >
                          <FieldGroup>
                            <Field>
                              <FieldLabel htmlFor="team-name">
                                {t("teamName")}
                              </FieldLabel>
                              <Input
                                id="team-name"
                                required
                                minLength={2}
                                value={teamForm.name}
                                onChange={(event) =>
                                  setTeamForm({
                                    ...teamForm,
                                    name: event.target.value,
                                  })
                                }
                              />
                            </Field>
                            <Field>
                              <FieldLabel htmlFor="team-description">
                                {t("descriptionLabel")}
                              </FieldLabel>
                              <Textarea
                                id="team-description"
                                value={teamForm.description}
                                onChange={(event) =>
                                  setTeamForm({
                                    ...teamForm,
                                    description: event.target.value,
                                  })
                                }
                              />
                            </Field>
                          </FieldGroup>
                          <DialogFooter>
                            <MutatingButton
                              pending={pendingAction === "createTeam"}
                            >
                              {t("createTeam")}
                            </MutatingButton>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </CardAction>
                ) : null}
              </CardHeader>
              <CardContent>
                <div className="relative max-w-md">
                  <SearchIcon
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="team-search"
                    className="pl-9"
                    value={teamQuery}
                    placeholder={t("searchTeams")}
                    aria-label={t("searchTeams")}
                    onChange={(event) => {
                      setTeamQuery(event.target.value);
                      setVisibleTeamCount(20);
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            {filteredTeams.length === 0 ? (
              <Empty className="min-h-64 border border-border/70 lg:col-span-2">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UsersIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>
                    {teamQuery ? t("noSearchResults") : t("noTeams")}
                  </EmptyTitle>
                  <EmptyDescription>
                    {teamQuery
                      ? t("noSearchResultsDescription")
                      : t("noTeamsDescription")}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              filteredTeams.slice(0, visibleTeamCount).map((team) => (
                <TeamCard
                  key={team.id}
                  team={team}
                  members={activeMembers}
                  canManage={canManageTeams}
                  pending={pendingAction}
                  onAdd={(userId) =>
                    mutate(
                      `team-${team.id}`,
                      {
                        action: "addTeamMember",
                        workspaceId,
                        teamId: team.id,
                        userId,
                      },
                      t("teamMemberAdded"),
                    )
                  }
                  onRemove={(userId) =>
                    mutate(
                      `team-member-${team.id}-${userId}`,
                      {
                        action: "removeTeamMember",
                        workspaceId,
                        teamId: team.id,
                        userId,
                      },
                      t("teamMemberRemoved"),
                    )
                  }
                  onDelete={() =>
                    mutate(
                      `delete-team-${team.id}`,
                      {
                        action: "deleteTeam",
                        workspaceId,
                        teamId: team.id,
                      },
                      t("teamDeleted"),
                    )
                  }
                />
              ))
            )}
            {filteredTeams.length > visibleTeamCount ? (
              <div className="flex justify-center lg:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setVisibleTeamCount((count) => count + 20)}
                >
                  {t("showMore", {
                    count: Math.min(
                      20,
                      filteredTeams.length - visibleTeamCount,
                    ),
                  })}
                </Button>
              </div>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="roles">
          <Card>
            <CardHeader>
              <CardTitle>{t("rolesTitle")}</CardTitle>
              <CardDescription>{t("rolesDescription")}</CardDescription>
              {canManageProjectAccess || canManageOrganizationAccess ? (
                <CardAction>
                  <Dialog
                    open={roleOpen}
                    onOpenChange={(open) => {
                      setRoleOpen(open);
                      if (open && !canManageOrganizationAccess) {
                        setRoleForm((current) => ({
                          ...current,
                          scopeType: "workspace",
                          permissions: current.permissions.filter(
                            (permission) =>
                              isPermissionCompatibleWithScope(
                                permission,
                                "workspace",
                              ),
                          ),
                        }));
                      }
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          setEditingRoleId(null);
                          setRoleEditorReadOnly(false);
                          setRoleForm(INITIAL_ROLE_FORM);
                          setPermissionQuery("");
                        }}
                      >
                        <PlusIcon data-icon="inline-start" aria-hidden="true" />
                        {t("createRole")}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[min(46rem,calc(100vh-2rem))] overflow-y-auto sm:max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>
                          {roleEditorReadOnly
                            ? t("viewRoleTitle", {
                                name: roleForm.displayName,
                              })
                            : editingRoleId
                              ? t("editRoleTitle", {
                                  name: roleForm.displayName,
                                })
                              : t("createRoleTitle")}
                        </DialogTitle>
                        <DialogDescription>
                          {roleEditorReadOnly
                            ? t("builtInRoleDescription")
                            : editingRoleId
                              ? t("editRoleDescription")
                              : t("createRoleDescription")}
                        </DialogDescription>
                      </DialogHeader>
                      <form
                        className="contents"
                        onSubmit={async (event) => {
                          event.preventDefault();
                          const saved = await mutate(
                            editingRoleId ? "updateRole" : "createRole",
                            editingRoleId
                              ? {
                                  action: "updateRole",
                                  workspaceId,
                                  roleId: editingRoleId,
                                  displayName: roleForm.displayName,
                                  description: roleForm.description,
                                  permissions: roleForm.permissions,
                                }
                              : {
                                  action: "createRole",
                                  workspaceId,
                                  ...roleForm,
                                },
                            editingRoleId ? t("roleUpdated") : t("roleCreated"),
                            { close: () => setRoleOpen(false) },
                          );
                          if (saved) {
                            setEditingRoleId(null);
                            setRoleForm(INITIAL_ROLE_FORM);
                          }
                        }}
                      >
                        <FieldGroup>
                          <Field>
                            <FieldLabel htmlFor="role-name">
                              {t("roleName")}
                            </FieldLabel>
                            <Input
                              id="role-name"
                              disabled={roleEditorReadOnly}
                              required
                              minLength={2}
                              value={roleForm.displayName}
                              onChange={(event) =>
                                setRoleForm({
                                  ...roleForm,
                                  displayName: event.target.value,
                                })
                              }
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="role-description">
                              {t("descriptionLabel")}
                            </FieldLabel>
                            <Textarea
                              id="role-description"
                              disabled={roleEditorReadOnly}
                              value={roleForm.description}
                              onChange={(event) =>
                                setRoleForm({
                                  ...roleForm,
                                  description: event.target.value,
                                })
                              }
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="custom-role-scope">
                              {t("roleScope")}
                            </FieldLabel>
                            <Select
                              disabled={Boolean(editingRoleId)}
                              value={roleForm.scopeType}
                              onValueChange={(value) =>
                                setRoleForm({
                                  ...roleForm,
                                  scopeType: value as
                                    | "organization"
                                    | "workspace",
                                  permissions: roleForm.permissions.filter(
                                    (permission) =>
                                      isPermissionCompatibleWithScope(
                                        permission,
                                        value as "organization" | "workspace",
                                      ),
                                  ),
                                })
                              }
                            >
                              <SelectTrigger
                                id="custom-role-scope"
                                className="w-full"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectItem value="workspace">
                                    {t("projectRole")}
                                  </SelectItem>
                                  {canManageOrganizationAccess ? (
                                    <SelectItem value="organization">
                                      {t("organizationRole")}
                                    </SelectItem>
                                  ) : null}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="permission-search">
                              {t("searchPermissions")}
                            </FieldLabel>
                            <div className="relative">
                              <SearchIcon
                                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                                aria-hidden="true"
                              />
                              <Input
                                id="permission-search"
                                className="pl-9"
                                value={permissionQuery}
                                placeholder={t("searchPlaceholder")}
                                onChange={(event) =>
                                  setPermissionQuery(event.target.value)
                                }
                              />
                            </div>
                          </Field>
                          <div className="flex flex-col gap-4">
                            {snapshot.permissionCatalog.map((group) => {
                              const visiblePermissions =
                                group.permissions.filter((permission) =>
                                  [
                                    t(
                                      `permissions.${permission.id.replaceAll(".", "_")}.label`,
                                    ),
                                    t(
                                      `permissions.${permission.id.replaceAll(".", "_")}.description`,
                                    ),
                                    permission.id,
                                  ].some((value) =>
                                    value
                                      .toLocaleLowerCase()
                                      .includes(
                                        permissionQuery
                                          .trim()
                                          .toLocaleLowerCase(),
                                      ),
                                  ),
                                );
                              if (visiblePermissions.length === 0) return null;
                              const compatiblePermissions =
                                visiblePermissions.filter((permission) =>
                                  isPermissionCompatibleWithScope(
                                    permission.id,
                                    roleForm.scopeType,
                                  ),
                                );
                              const allSelected =
                                compatiblePermissions.length > 0 &&
                                compatiblePermissions.every((permission) =>
                                  roleForm.permissions.includes(permission.id),
                                );
                              return (
                                <fieldset
                                  key={group.id}
                                  className="flex flex-col gap-3 rounded-2xl border border-border/70 p-4"
                                >
                                  <legend className="flex w-full items-center justify-between gap-3 px-1 font-semibold">
                                    <span>
                                      {t(`permissionGroups.${group.id}.label`)}
                                    </span>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      disabled={roleEditorReadOnly}
                                      onClick={() =>
                                        setRoleForm((current) => ({
                                          ...current,
                                          permissions: allSelected
                                            ? current.permissions.filter(
                                                (permission) =>
                                                  !compatiblePermissions.some(
                                                    (item) =>
                                                      item.id === permission,
                                                  ),
                                              )
                                            : [
                                                ...new Set([
                                                  ...current.permissions,
                                                  ...compatiblePermissions.map(
                                                    (permission) =>
                                                      permission.id,
                                                  ),
                                                ]),
                                              ],
                                        }))
                                      }
                                    >
                                      {allSelected
                                        ? t("clearGroup")
                                        : t("selectGroup")}
                                    </Button>
                                  </legend>
                                  <p className="text-sm text-muted-foreground">
                                    {t(
                                      `permissionGroups.${group.id}.description`,
                                    )}
                                  </p>
                                  <FieldGroup data-slot="checkbox-group">
                                    {visiblePermissions.map((permission) => {
                                      const checked =
                                        roleForm.permissions.includes(
                                          permission.id,
                                        );
                                      const compatible =
                                        isPermissionCompatibleWithScope(
                                          permission.id,
                                          roleForm.scopeType,
                                        );
                                      return (
                                        <Field
                                          key={permission.id}
                                          orientation="horizontal"
                                          data-disabled={!compatible}
                                        >
                                          <Checkbox
                                            id={`permission-${permission.id}`}
                                            checked={checked}
                                            disabled={
                                              !compatible || roleEditorReadOnly
                                            }
                                            onCheckedChange={(nextChecked) =>
                                              setRoleForm((current) => ({
                                                ...current,
                                                permissions: nextChecked
                                                  ? [
                                                      ...current.permissions,
                                                      permission.id,
                                                    ]
                                                  : current.permissions.filter(
                                                      (item) =>
                                                        item !== permission.id,
                                                    ),
                                              }))
                                            }
                                          />
                                          <FieldContent>
                                            <FieldLabel
                                              htmlFor={`permission-${permission.id}`}
                                            >
                                              {t(
                                                `permissions.${permission.id.replaceAll(".", "_")}.label`,
                                              )}
                                            </FieldLabel>
                                            <FieldDescription>
                                              {t(
                                                `permissions.${permission.id.replaceAll(".", "_")}.description`,
                                              )}
                                            </FieldDescription>
                                          </FieldContent>
                                        </Field>
                                      );
                                    })}
                                  </FieldGroup>
                                </fieldset>
                              );
                            })}
                          </div>
                        </FieldGroup>
                        <DialogFooter className="sticky bottom-0">
                          {roleEditorReadOnly && canCustomizeViewedRole ? (
                            <Button
                              type="button"
                              onClick={() => {
                                setRoleEditorReadOnly(false);
                                setEditingRoleId(null);
                                setRoleForm((current) => ({
                                  ...current,
                                  displayName: t("roleCopyName", {
                                    name: current.displayName,
                                  }),
                                }));
                              }}
                            >
                              <CopyIcon
                                data-icon="inline-start"
                                aria-hidden="true"
                              />
                              {t("duplicateAndCustomize")}
                            </Button>
                          ) : roleEditorReadOnly ? null : (
                            <MutatingButton
                              pending={
                                pendingAction ===
                                (editingRoleId ? "updateRole" : "createRole")
                              }
                            >
                              {editingRoleId ? t("saveRole") : t("createRole")}
                            </MutatingButton>
                          )}
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-4 px-0">
              <div className="relative mx-6 max-w-md">
                <SearchIcon
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="role-search"
                  className="pl-9"
                  value={roleQuery}
                  placeholder={t("searchRoles")}
                  aria-label={t("searchRoles")}
                  onChange={(event) => {
                    setRoleQuery(event.target.value);
                    setVisibleRoleCount(25);
                  }}
                />
              </div>
              {filteredRoles.length === 0 ? (
                <Empty className="min-h-52">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ShieldIcon aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle>{t("noSearchResults")}</EmptyTitle>
                    <EmptyDescription>
                      {t("noSearchResultsDescription")}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="overflow-x-auto border-y border-border/60">
                  <table className="w-full min-w-[52rem] text-left">
                    <thead className="bg-muted/35 text-xs font-medium text-muted-foreground">
                      <tr>
                        <th className="px-6 py-3">{t("roleColumn")}</th>
                        <th className="px-3 py-3">{t("scope")}</th>
                        <th className="px-3 py-3">{t("permissionsColumn")}</th>
                        <th className="px-3 py-3">{t("assignmentsColumn")}</th>
                        <th className="w-32 px-6 py-3 text-right">
                          {t("actions")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {filteredRoles.slice(0, visibleRoleCount).map((role) => {
                        const assignmentCount = snapshot.assignments.filter(
                          (item) => item.roleId === role.id,
                        ).length;
                        const canManageRole =
                          !role.isSystem &&
                          (role.scopeType === "organization"
                            ? canManageOrganizationAccess
                            : canManageProjectAccess);
                        return (
                          <tr
                            key={role.id}
                            className="align-top transition-colors hover:bg-muted/20"
                          >
                            <td className="px-6 py-4">
                              <div className="min-w-64">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium">
                                    {roleLabel(role.name, role.displayName)}
                                  </span>
                                  {role.isSystem ? (
                                    <Badge variant="secondary">
                                      <LockKeyholeIcon aria-hidden="true" />
                                      {t("builtIn")}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline">
                                      {t("custom")}
                                    </Badge>
                                  )}
                                </div>
                                <p className="mt-1 max-w-lg text-xs text-muted-foreground">
                                  {role.description || t("noRoleDescription")}
                                </p>
                              </div>
                            </td>
                            <td className="px-3 py-4">
                              <Badge variant="outline">
                                {role.scopeType === "organization"
                                  ? t("organizationScope")
                                  : t("projectScope")}
                              </Badge>
                            </td>
                            <td className="px-3 py-4">
                              <button
                                type="button"
                                className="text-left text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => {
                                  setEditingRoleId(role.id);
                                  setRoleEditorReadOnly(role.isSystem);
                                  setRoleForm({
                                    displayName: roleLabel(
                                      role.name,
                                      role.displayName,
                                    ),
                                    description: role.description ?? "",
                                    scopeType:
                                      role.scopeType === "organization"
                                        ? "organization"
                                        : "workspace",
                                    permissions: [...role.permissions],
                                  });
                                  setPermissionQuery("");
                                  setRoleOpen(true);
                                }}
                              >
                                {t("permissionCount", {
                                  count: role.permissions.length,
                                })}
                              </button>
                            </td>
                            <td className="px-3 py-4 text-sm text-muted-foreground">
                              {t("assignmentCount", {
                                count: assignmentCount,
                              })}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex justify-end gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingRoleId(role.id);
                                    setRoleEditorReadOnly(role.isSystem);
                                    setRoleForm({
                                      displayName: roleLabel(
                                        role.name,
                                        role.displayName,
                                      ),
                                      description: role.description ?? "",
                                      scopeType:
                                        role.scopeType === "organization"
                                          ? "organization"
                                          : "workspace",
                                      permissions: [...role.permissions],
                                    });
                                    setPermissionQuery("");
                                    setRoleOpen(true);
                                  }}
                                >
                                  {canManageRole ? (
                                    <PencilIcon
                                      data-icon="inline-start"
                                      aria-hidden="true"
                                    />
                                  ) : null}
                                  {canManageRole ? t("edit") : t("view")}
                                </Button>
                                {canManageRole ? (
                                  <ConfirmRemovalButton
                                    pending={
                                      pendingAction === `delete-role-${role.id}`
                                    }
                                    label={t("deleteRole", {
                                      name: role.displayName,
                                    })}
                                    title={t("deleteRoleTitle", {
                                      name: role.displayName,
                                    })}
                                    description={t("deleteRoleDescription")}
                                    onConfirm={() =>
                                      void mutate(
                                        `delete-role-${role.id}`,
                                        {
                                          action: "deleteRole",
                                          workspaceId,
                                          roleId: role.id,
                                        },
                                        t("roleDeleted"),
                                      )
                                    }
                                  />
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {filteredRoles.length > visibleRoleCount ? (
                <div className="flex justify-center px-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setVisibleRoleCount((count) => count + 25)}
                  >
                    {t("showMore", {
                      count: Math.min(
                        25,
                        filteredRoles.length - visibleRoleCount,
                      ),
                    })}
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TeamCard({
  team,
  members,
  canManage,
  pending,
  onAdd,
  onRemove,
  onDelete,
}: {
  team: AccessTeam;
  members: AccessMember[];
  canManage: boolean;
  pending: string | null;
  onAdd: (userId: string) => Promise<boolean>;
  onRemove: (userId: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const t = useTranslations("access");
  const [userId, setUserId] = useState("");
  const availableMembers = members.filter(
    (member) =>
      !team.members.some((teamMember) => teamMember.userId === member.userId),
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!userId) return;
    if (await onAdd(userId)) setUserId("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{team.name}</CardTitle>
        <CardDescription>
          {team.description || t("noTeamDescription")}
        </CardDescription>
        <CardAction className="flex items-center gap-1">
          <Badge variant="secondary">
            {t("memberCount", { count: team.members.length })}
          </Badge>
          {canManage ? (
            <ConfirmRemovalButton
              pending={pending === `delete-team-${team.id}`}
              label={t("deleteTeam", { name: team.name })}
              title={t("deleteTeamTitle", { name: team.name })}
              description={t("deleteTeamDescription")}
              onConfirm={() => void onDelete()}
            />
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {team.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("emptyTeam")}</p>
          ) : (
            team.members.map((member) => (
              <span key={member.id} className="flex items-center gap-0.5">
                <Badge variant="outline">{member.name}</Badge>
                {canManage ? (
                  <ConfirmRemovalButton
                    pending={
                      pending === `team-member-${team.id}-${member.userId}`
                    }
                    label={t("removeTeamMember", { name: member.name })}
                    title={t("removeTeamMemberTitle", { name: member.name })}
                    description={t("removeTeamMemberDescription", {
                      team: team.name,
                    })}
                    onConfirm={() => void onRemove(member.userId)}
                  />
                ) : null}
              </span>
            ))
          )}
        </div>
        {canManage && availableMembers.length > 0 ? (
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={submit}
          >
            <Field className="flex-1">
              <FieldLabel htmlFor={`team-member-${team.id}`}>
                {t("addTeamMember")}
              </FieldLabel>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger id={`team-member-${team.id}`} className="w-full">
                  <SelectValue placeholder={t("chooseMember")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {availableMembers.map((member) => (
                      <SelectItem key={member.userId} value={member.userId}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Button
              type="submit"
              disabled={!userId || pending === `team-${team.id}`}
            >
              {pending === `team-${team.id}` ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <PlusIcon data-icon="inline-start" aria-hidden="true" />
              )}
              {t("add")}
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
