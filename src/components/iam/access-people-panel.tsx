import { AccessPeopleFilters } from "./access-people-filters";
import { SearchIcon } from "lucide-react";
import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
import { AccessPeopleBranch1 } from "./access-console.access-console.view.section-1.section-3.branch-1";
import { AccessPeopleBranch2 } from "./access-console.access-console.view.section-1.section-3.branch-2";
import { AccessPeopleBranch3 } from "./access-console.access-console.view.section-1.section-3.branch-3";
import { AccessPeopleBranch4 } from "./access-console.access-console.view.section-1.section-3.branch-4";
import { AccessPeopleBranch5 } from "./access-console.access-console.view.section-1.section-3.branch-5";

export function AccessPeoplePanel({
  model,
}: {
  model: AccessConsoleViewModel;
}) {
  const {
    canManageMembers,
    canManageOrganizationAccess,
    canManageProjectAccess,
    people,
    peopleQuery,
    setPeopleQuery,
    setVisiblePeopleCount,
    t,
    visiblePeople,
    workspaceId,
    setPeopleTeamId,
    setPeopleProjectOnly,
    setSelectedPeople,
  } = model;
  useEffect(() => {
    setPeopleTeamId("all");
    setPeopleProjectOnly(false);
    setSelectedPeople([]);
  }, [workspaceId, setPeopleTeamId, setPeopleProjectOnly, setSelectedPeople]);
  const showInvite =
    canManageMembers || canManageProjectAccess || canManageOrganizationAccess;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="relative min-w-0 w-full max-w-md">
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
              model.setSelectedPeople([]);
              setVisiblePeopleCount(25);
            }}
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <AccessPeopleFilters model={model} />
          {showInvite ? <AccessPeopleBranch5 model={model} /> : null}
        </div>
      </div>
      {people.length === 0 ? (
        <AccessPeopleBranch3 model={model} />
      ) : (
        <AccessPeopleBranch2 model={model} />
      )}
      <AccessPeopleFilterStatus model={model} />
      {people.length > visiblePeople.length ? (
        <AccessPeopleBranch1 model={model} />
      ) : null}
      {canManageProjectAccess || canManageOrganizationAccess ? (
        <AccessPeopleBranch4 model={model} />
      ) : null}
    </div>
  );
}

function AccessPeopleFilterStatus({
  model,
}: {
  model: AccessConsoleViewModel;
}) {
  const { t, peopleTeamId, peopleQuery } = model;
  const active = peopleTeamId !== "all" || Boolean(peopleQuery);
  return (
    <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
      <p role="status" className="text-xs text-muted-foreground">
        {t("filters.resultCount", {
          count: model.people.length,
          total: model.totalPeopleCount,
        })}
      </p>
      {active ? (
        <button
          type="button"
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => {
            model.setPeopleTeamId("all");
            model.setPeopleQuery("");
            model.setSelectedPeople([]);
            model.setVisiblePeopleCount(25);
          }}
        >
          {t("filters.clear")}
        </button>
      ) : null}
    </div>
  );
}
