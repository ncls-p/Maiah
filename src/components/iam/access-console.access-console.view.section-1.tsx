import type { AccessConsoleViewModel } from "./access-console.access-console.view";
import { AccessRolesPanel } from "./access-roles-panel";
import { AccessTeamsPanel } from "./access-teams-panel";
import { AccessPeoplePanel } from "./access-people-panel";
import { ResourceAccessPanel } from "./access-console.resource-access-panel";

export function AccessConsoleSection1({
  model,
  section,
}: {
  model: AccessConsoleViewModel;
  section: "people" | "teams" | "roles" | "resources";
}) {
  const { snapshot, workspaceId } = model;
  if (section === "teams") return <AccessTeamsPanel model={model} />;
  if (section === "roles") return <AccessRolesPanel model={model} />;
  if (section === "resources") {
    return (
      <ResourceAccessPanel
        key={workspaceId}
        workspaceId={workspaceId}
        organizationId={snapshot.organization.id}
        definitions={snapshot.resourceDefinitions}
        canManageResources={snapshot.capabilities.canManageProjectAccess}
      />
    );
  }
  return <AccessPeoplePanel model={model} />;
}
