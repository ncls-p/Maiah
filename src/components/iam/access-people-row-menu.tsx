import { ImpersonatePerson } from "./impersonate-person";
import {
  ArrowRightLeftIcon,
  EllipsisIcon,
  LockKeyholeIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UserPlusIcon,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { AccessPeopleAccessDetails } from "./access-people-access-details";

type Person = AccessConsoleViewModel["visiblePeople"][number];

export function AccessPeopleRowMenu({
  model,
  person,
}: {
  model: AccessConsoleViewModel;
  person: Person;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const {
    busyPlatformUserId,
    canManageMembers,
    canManageOrganizationAccess,
    canManageProjectAccess,
    currentUserId,
    mutate,
    openMemberTransfer,
    platformUsers,
    setAssignment,
    setAssignmentOpen,
    setBulkAssignmentIds,
    setSelectedPeople,
    t,
    updatePlatformAccount,
    workspaceId,
  } = model;
  const isMember = person.memberStatus === "active";
  const canGrant =
    model.snapshot.subordinateIds.workspace.includes(person.userId) &&
    model.snapshot.actions.workspace["roles.assign"];
  const isCurrentUser = person.userId === currentUserId;
  const canTransfer =
    isMember && (canManageProjectAccess || canManageOrganizationAccess);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t("personActions", { name: person.name })}
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
          <DropdownMenuItem onSelect={() => setDetailsOpen(true)}>
            {t("simpleAccess.accessDetails")}
          </DropdownMenuItem>
          {platformUsers &&
          !isCurrentUser &&
          person.platformRole !== "admin" &&
          !person.banned ? (
            <ImpersonatePerson userId={person.userId} name={person.name} />
          ) : null}
          {isMember && canGrant ? (
            <DropdownMenuItem
              onSelect={() => {
                setBulkAssignmentIds([]);
                setAssignment({
                  principalType: "user",
                  principalId: person.userId,
                  roleId:
                    person.assignments.find((item) => item.scope === "project")
                      ?.roleId ?? "",
                  scopeType: "workspace",
                });
                setAssignmentOpen(true);
              }}
            >
              <ShieldCheckIcon aria-hidden="true" />
              {t(
                person.assignments.some((item) => item.scope === "project")
                  ? "simpleAccess.changeRole"
                  : "grantAccess",
              )}
            </DropdownMenuItem>
          ) : null}
          {canTransfer ? (
            <DropdownMenuItem
              onSelect={() => {
                setSelectedPeople([person.userId]);
                void openMemberTransfer();
              }}
            >
              <ArrowRightLeftIcon aria-hidden="true" />
              {t("transferSelected")}
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
                    role: person.platformRole === "admin" ? "user" : "admin",
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
                {person.banned ? t("restoreAccount") : t("suspendAccount")}
              </DropdownMenuItem>
            </>
          ) : null}
          {isMember &&
          model.snapshot.actions.organization["members.delete"] &&
          model.snapshot.subordinateIds.organization.includes(person.userId) ? (
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
      <AccessPeopleAccessDetails
        model={model}
        person={person}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />
    </>
  );
}
