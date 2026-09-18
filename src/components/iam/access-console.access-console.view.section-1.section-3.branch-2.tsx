import { PersonProjectRole } from "./person-project-role";
import { Badge } from "@/components/ui/badge";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
import { AccessPeopleRowMenu } from "./access-people-row-menu";

export function AccessPeopleBranch2({
  model,
}: {
  model: AccessConsoleViewModel;
}) {
  const { currentUserId, t, visiblePeople } = model;
  return (
    <div className="min-w-0 border-y border-border/60">
      <table className="w-full table-fixed text-left">
        <thead className="text-xs font-medium text-muted-foreground">
          <tr>
            <th className="px-3 py-3">{t("personColumn")}</th>
            <th className="px-3 py-3">{t("simpleAccess.projectRole")}</th>
            <th className="w-16 px-3 py-3 text-right">
              <span className="sr-only">{t("actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {visiblePeople.map((person) => {
            const isMember = person.memberStatus === "active";
            const isCurrentUser = person.userId === currentUserId;
            return (
              <tr key={person.userId} className="align-top hover:bg-muted/20">
                <td className="px-3 py-4">
                  <div className="flex min-w-0 items-start gap-3">
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
                        <span className="break-words [overflow-wrap:anywhere] font-medium">
                          {person.name}
                        </span>
                        {isCurrentUser ? (
                          <Badge variant="outline">{t("you")}</Badge>
                        ) : null}
                        {person.banned ? (
                          <Badge variant="destructive">{t("suspended")}</Badge>
                        ) : !isMember ? (
                          <Badge variant="secondary">{t("accountOnly")}</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        {person.email}
                      </p>
                      {person.teams.length > 0 ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {person.teams.map((team) => team.name).join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-4">
                  <PersonProjectRole model={model} person={person} />
                </td>
                <td className="px-3 py-4 text-right">
                  <AccessPeopleRowMenu model={model} person={person} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
