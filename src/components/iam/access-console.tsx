"use client";

import {
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
  scope: "organization" | "project";
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
                                          "organization" | "workspace",
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
                                          "user" | "group",
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
                                    "organization" | "workspace",
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
