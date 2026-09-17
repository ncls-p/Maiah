import { GovernanceSelect } from "./governance-select";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";

export function AccessPeopleFilters({
  model,
}: {
  model: AccessConsoleViewModel;
}) {
  const { t, snapshot, peopleTeamId } = model;
  return (
    <div className="min-w-48 sm:w-56">
      <GovernanceSelect
        label={t("filters.team")}
        value={peopleTeamId}
        options={[
          { id: "all", name: t("filters.allTeams") },
          ...snapshot.teams,
        ]}
        onChange={(id) => {
          model.setPeopleTeamId(id);
          model.setSelectedPeople([]);
          model.setVisiblePeopleCount(25);
        }}
      />
    </div>
  );
}
