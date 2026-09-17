import { ConfirmRemovalButton } from "./access-console.scope-path";
import { LockKeyholeIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
import { PersonMembershipsCell } from "./person-memberships-cell";
import { PersonOrganizationRole } from "./person-organization-role";

type Person = AccessConsoleViewModel["visiblePeople"][number];

export function AccessPeopleAccessDetails({
  model,
  person,
  open,
  onOpenChange,
}: {
  model: AccessConsoleViewModel;
  person: Person;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { mutate, pendingAction, roleLabel, t, workspaceId } = model;
  const isMember = person.memberStatus === "active";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{person.name}</DialogTitle>
          <DialogDescription>
            {t("simpleAccess.accessDetails")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              {t("organizationRole")}
            </p>
            <PersonOrganizationRole model={model} person={person} />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              {t("teamsColumn")}
            </p>
            <PersonMembershipsCell model={model} person={person} />
          </div>
          <div className="flex max-w-xl flex-wrap gap-1.5">
            {person.platformRole === "admin" ? (
              <Badge className="max-w-full whitespace-normal break-words">
                <LockKeyholeIcon aria-hidden="true" />
                {t("appAdministrator")}
              </Badge>
            ) : null}
            {person.assignments.map((item) => (
              <span
                key={item.id}
                className="inline-flex min-w-0 max-w-full items-center"
              >
                <Badge
                  variant={item.inherited ? "secondary" : "outline"}
                  className="min-w-0 max-w-full whitespace-normal break-words [overflow-wrap:anywhere]"
                >
                  {roleLabel(item.roleKey, item.roleName)}
                  {item.roleKey.startsWith("custom.") ? (
                    <span className="text-[10px] opacity-70">
                      ·{" "}
                      {item.scope === "organization"
                        ? t("organizationShort")
                        : t("projectShort")}
                    </span>
                  ) : null}
                </Badge>
                {model.snapshot.actions[
                  item.scope === "organization" ? "organization" : "workspace"
                ]["roles.revoke"] &&
                model.snapshot.subordinateIds[
                  item.scope === "organization" ? "organization" : "workspace"
                ].includes(person.userId) ? (
                  <ConfirmRemovalButton
                    pending={pendingAction === item.id}
                    label={t("removeAssignment", { name: item.principalName })}
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
                {isMember ? t("noExplicitAccess") : t("notInOrganization")}
              </span>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
