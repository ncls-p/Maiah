"use client";

import {
  Building2Icon,
  CheckIcon,
  ChevronRightIcon,
  FolderKanbanIcon,
  PlusIcon,
  RefreshCwIcon,
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
import { isPermissionCompatibleWithScope } from "@/modules/iam/permission-catalog";

type AccessMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  status: "active" | "suspended" | "removed";
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

export function AccessConsole() {
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
  const [assignment, setAssignment] = useState({
    principalType: "user" as "user" | "group",
    principalId: "",
    roleId: "",
    scopeType: "workspace" as "organization" | "workspace",
  });

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
        (role) => role.scopeType === assignment.scopeType,
      ) ?? [],
    [assignment.scopeType, snapshot],
  );
  const principalOptions =
    assignment.principalType === "user"
      ? activeMembers
      : (snapshot?.teams ?? []);

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
        <Field className="max-w-md">
          <FieldLabel htmlFor="access-project">{t("activeProject")}</FieldLabel>
          <Select value={workspaceId ?? ""} onValueChange={setWorkspaceId}>
            <SelectTrigger id="access-project" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {snapshot.projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

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
            <ShieldCheckIcon data-icon="inline-start" aria-hidden="true" />
            {t("tabs.access")}
          </TabsTrigger>
          <TabsTrigger value="members">
            <UsersIcon data-icon="inline-start" aria-hidden="true" />
            {t("tabs.members")}
          </TabsTrigger>
          <TabsTrigger value="teams">{t("tabs.teams")}</TabsTrigger>
          <TabsTrigger value="roles">{t("tabs.roles")}</TabsTrigger>
        </TabsList>

        <TabsContent value="access" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("assignmentsTitle")}</CardTitle>
              <CardDescription>{t("assignmentsDescription")}</CardDescription>
              {canManageProjectAccess || canManageOrganizationAccess ? (
                <CardAction>
                  <Dialog
                    open={assignmentOpen}
                    onOpenChange={(open) => {
                      setAssignmentOpen(open);
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
                      <Button type="button" size="sm">
                        <PlusIcon data-icon="inline-start" aria-hidden="true" />
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
                            {
                              action: "assignRole",
                              workspaceId,
                              ...assignment,
                            },
                            t("roleAssigned"),
                            { close: () => setAssignmentOpen(false) },
                          );
                          if (saved) {
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
                                  principalType: value as "user" | "group",
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
                          <Field>
                            <FieldLabel htmlFor="assignment-principal">
                              {t("principal")}
                            </FieldLabel>
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
                            <Select
                              required
                              value={assignment.roleId}
                              onValueChange={(value) =>
                                setAssignment({ ...assignment, roleId: value })
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
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent>
              {snapshot.assignments.length === 0 ? (
                <Empty className="min-h-52">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ShieldIcon aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle>{t("noAssignments")}</EmptyTitle>
                    <EmptyDescription>
                      {t("noAssignmentsDescription")}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="flex flex-col divide-y divide-border/60">
                  {snapshot.assignments.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium">
                            {item.principalName}
                          </p>
                          <Badge variant="outline">
                            {item.principalType === "team"
                              ? t("team")
                              : t("member")}
                          </Badge>
                          {item.inherited ? (
                            <Badge variant="secondary">{t("inherited")}</Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {roleLabel(item.roleKey, item.roleName)} ·{" "}
                          {item.scope === "organization"
                            ? t("organizationScope")
                            : t("projectScope")}
                        </p>
                      </div>
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
                          description={t("removeAssignmentDescription", {
                            role: roleLabel(item.roleKey, item.roleName),
                            scope:
                              item.scope === "organization"
                                ? t("organizationScope")
                                : t("projectScope"),
                          })}
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
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle>{t("membersTitle")}</CardTitle>
              <CardDescription>
                {t("membersDescription", { count: activeMembers.length })}
              </CardDescription>
              {canManageMembers ? (
                <CardAction>
                  <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
                    <DialogTrigger asChild>
                      <Button type="button" size="sm">
                        <UserPlusIcon
                          data-icon="inline-start"
                          aria-hidden="true"
                        />
                        {t("addMember")}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{t("addMemberTitle")}</DialogTitle>
                        <DialogDescription>
                          {t("addMemberDescription")}
                        </DialogDescription>
                      </DialogHeader>
                      <form
                        className="contents"
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
                          <FieldDescription>
                            {t("accountRequired")}
                          </FieldDescription>
                        </Field>
                        <DialogFooter>
                          <MutatingButton
                            pending={pendingAction === "addMember"}
                          >
                            {t("addMember")}
                          </MutatingButton>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border/60">
              {activeMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{member.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {member.email}
                    </p>
                  </div>
                  {canManageMembers ? (
                    <ConfirmRemovalButton
                      pending={pendingAction === member.userId}
                      label={t("removeMember", { name: member.name })}
                      title={t("removeMemberTitle", { name: member.name })}
                      description={t("removeMemberDescription", {
                        name: member.name,
                        organization: snapshot.organization.name,
                      })}
                      onConfirm={() =>
                        void mutate(
                          member.userId,
                          {
                            action: "removeMember",
                            workspaceId,
                            userId: member.userId,
                          },
                          t("memberRemoved"),
                        )
                      }
                    />
                  ) : null}
                </div>
              ))}
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
            </Card>

            {snapshot.teams.length === 0 ? (
              <Empty className="min-h-64 border border-border/70 lg:col-span-2">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UsersIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>{t("noTeams")}</EmptyTitle>
                  <EmptyDescription>{t("noTeamsDescription")}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              snapshot.teams.map((team) => (
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
                      <Button type="button" size="sm">
                        <PlusIcon data-icon="inline-start" aria-hidden="true" />
                        {t("createRole")}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[min(46rem,calc(100vh-2rem))] overflow-y-auto sm:max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>{t("createRoleTitle")}</DialogTitle>
                        <DialogDescription>
                          {t("createRoleDescription")}
                        </DialogDescription>
                      </DialogHeader>
                      <form
                        className="contents"
                        onSubmit={async (event) => {
                          event.preventDefault();
                          const saved = await mutate(
                            "createRole",
                            {
                              action: "createRole",
                              workspaceId,
                              ...roleForm,
                            },
                            t("roleCreated"),
                            { close: () => setRoleOpen(false) },
                          );
                          if (saved) setRoleForm(INITIAL_ROLE_FORM);
                        }}
                      >
                        <FieldGroup>
                          <Field>
                            <FieldLabel htmlFor="role-name">
                              {t("roleName")}
                            </FieldLabel>
                            <Input
                              id="role-name"
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
                          <div className="flex flex-col gap-4">
                            {snapshot.permissionCatalog.map((group) => (
                              <fieldset
                                key={group.id}
                                className="flex flex-col gap-3 rounded-2xl border border-border/70 p-4"
                              >
                                <legend className="px-1 font-semibold">
                                  {t(`permissionGroups.${group.id}.label`)}
                                </legend>
                                <p className="text-sm text-muted-foreground">
                                  {t(
                                    `permissionGroups.${group.id}.description`,
                                  )}
                                </p>
                                <FieldGroup data-slot="checkbox-group">
                                  {group.permissions.map((permission) => {
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
                                          disabled={!compatible}
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
                            ))}
                          </div>
                        </FieldGroup>
                        <DialogFooter className="sticky bottom-0">
                          <MutatingButton
                            pending={pendingAction === "createRole"}
                          >
                            {t("createRole")}
                          </MutatingButton>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {snapshot.roles
                .filter((role) => role.scopeType !== "system")
                .map((role) => (
                  <div
                    key={role.id}
                    className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {roleLabel(role.name, role.displayName)}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {role.description || t("noRoleDescription")}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Badge
                          variant={role.isSystem ? "secondary" : "outline"}
                        >
                          {role.scopeType === "organization"
                            ? t("organizationScope")
                            : t("projectScope")}
                        </Badge>
                        {!role.isSystem &&
                        (role.scopeType === "organization"
                          ? canManageOrganizationAccess
                          : canManageProjectAccess) ? (
                          <ConfirmRemovalButton
                            pending={pendingAction === `delete-role-${role.id}`}
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
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("permissionCount", {
                        count: role.permissions.length,
                      })}
                    </p>
                  </div>
                ))}
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
