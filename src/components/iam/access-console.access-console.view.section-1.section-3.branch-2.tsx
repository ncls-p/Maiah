import {
  EllipsisIcon,
  LockKeyholeIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UserPlusIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
import { ConfirmRemovalButton } from "./access-console.scope-path";
export function AccessPeopleBranch2({
  model,
}: {
  model: AccessConsoleViewModel;
}) {
  const {
    allVisiblePeopleSelected,
    busyPlatformUserId,
    canManageMembers,
    currentUserId,
    mutate,
    pendingAction,
    platformUsers,
    roleLabel,
    selectedPeople,
    selectedVisiblePeople,
    setAssignment,
    setAssignmentOpen,
    setBulkAssignmentIds,
    setSelectedPeople,
    t,
    updatePlatformAccount,
    visiblePeople,
    workspaceId,
  } = model;
  return (
    <div className="border-y border-border/60">
      <table className="w-full text-left max-md:block">
        <thead className="bg-muted/35 text-xs font-medium text-muted-foreground max-md:sr-only">
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
                      : current.filter((id) => !visibleIds.includes(id));
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
        <tbody className="divide-y divide-border/60 max-md:grid max-md:gap-3 max-md:divide-y-0 max-md:bg-muted/15 max-md:p-3">
          {visiblePeople.map((person) => {
            const isMember = person.memberStatus === "active";
            const canGrant =
              model.snapshot.subordinateIds.workspace.includes(person.userId) &&
              model.snapshot.actions.workspace["roles.assign"];
            const isCurrentUser = person.userId === currentUserId;
            return (
              <tr
                key={person.userId}
                className="align-top transition-colors hover:bg-muted/20 max-md:grid max-md:grid-cols-[auto_minmax(0,1fr)_auto] max-md:overflow-hidden max-md:rounded-2xl max-md:border max-md:border-border/70 max-md:bg-background max-md:shadow-sm"
              >
                <td className="px-6 py-4 max-md:px-3">
                  <Checkbox
                    id={`select-person-${person.userId}`}
                    aria-label={t("selectPerson", {
                      name: person.name,
                    })}
                    disabled={!isMember || !canGrant}
                    checked={selectedPeople.includes(person.userId)}
                    onCheckedChange={(checked) =>
                      setSelectedPeople((current) =>
                        checked
                          ? [...new Set([...current, person.userId])]
                          : current.filter((id) => id !== person.userId),
                      )
                    }
                  />
                </td>
                <td className="px-3 py-4 max-md:px-0">
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
                        <span className="font-medium">{person.name}</span>
                        {isCurrentUser ? (
                          <Badge variant="outline">{t("you")}</Badge>
                        ) : null}
                        {person.banned ? (
                          <Badge variant="destructive">{t("suspended")}</Badge>
                        ) : !isMember ? (
                          <Badge variant="secondary">{t("accountOnly")}</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {person.email}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-4 max-md:col-span-3 max-md:border-t max-md:border-border/60 max-md:px-4 max-md:py-3">
                  <span className="mb-2 hidden text-xs font-medium text-muted-foreground max-md:block">
                    {t("accessColumn")}
                  </span>
                  <div className="flex max-w-xl flex-wrap gap-1.5">
                    {person.platformRole === "admin" ? (
                      <Badge>
                        <LockKeyholeIcon aria-hidden="true" />
                        {t("appAdministrator")}
                      </Badge>
                    ) : null}
                    {person.assignments.map((item) => (
                      <span key={item.id} className="inline-flex items-center">
                        <Badge
                          variant={item.inherited ? "secondary" : "outline"}
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
                        {model.snapshot.actions[
                          item.scope === "organization"
                            ? "organization"
                            : "workspace"
                        ]["roles.revoke"] &&
                        model.snapshot.subordinateIds[
                          item.scope === "organization"
                            ? "organization"
                            : "workspace"
                        ].includes(person.userId) ? (
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
                <td className="px-3 py-4 max-md:col-span-3 max-md:border-t max-md:border-border/60 max-md:px-4 max-md:py-3">
                  <span className="mb-2 hidden text-xs font-medium text-muted-foreground max-md:block">
                    {t("teamsColumn")}
                  </span>
                  <div className="flex max-w-xs flex-wrap gap-1">
                    {person.teams.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
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
                <td className="px-6 py-4 text-right max-md:col-start-3 max-md:row-start-1 max-md:px-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t("personActions", {
                          name: person.name,
                        })}
                        disabled={busyPlatformUserId === person.userId}
                      >
                        {busyPlatformUserId === person.userId ? (
                          <Spinner />
                        ) : (
                          <EllipsisIcon aria-hidden="true" />
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      <DropdownMenuLabel>{person.name}</DropdownMenuLabel>
                      {isMember && canGrant ? (
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
                              void updatePlatformAccount(person.userId, {
                                role:
                                  person.platformRole === "admin"
                                    ? "user"
                                    : "admin",
                              })
                            }
                          >
                            <LockKeyholeIcon aria-hidden="true" />
                            {person.platformRole === "admin"
                              ? t("removeAppAdmin")
                              : t("makeAppAdmin")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant={person.banned ? "default" : "destructive"}
                            disabled={isCurrentUser}
                            onSelect={() =>
                              void updatePlatformAccount(person.userId, {
                                banned: !person.banned,
                              })
                            }
                          >
                            {person.banned
                              ? t("restoreAccount")
                              : t("suspendAccount")}
                          </DropdownMenuItem>
                        </>
                      ) : null}
                      {isMember &&
                      model.snapshot.actions.organization["members.delete"] &&
                      model.snapshot.subordinateIds.organization.includes(
                        person.userId,
                      ) ? (
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
  );
}
