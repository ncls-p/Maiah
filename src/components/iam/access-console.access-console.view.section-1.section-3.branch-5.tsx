import { CardAction } from "@/components/ui/card";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
import { AccessPeopleTransferBranch1 } from "./access-console.access-console.view.section-1.section-3.branch-5.branch-1";
import { AccessPeopleTransferBranch2 } from "./access-console.access-console.view.section-1.section-3.branch-5.branch-2";

export function AccessPeopleBranch5({
  model,
}: {
  model: AccessConsoleViewModel;
}) {
  const {
    canManageMembers,
    canManageOrganizationAccess,
    canManageProjectAccess,
  } = model;
  return (
    <CardAction className="col-start-1 row-start-3 row-span-1 mt-2 flex-wrap justify-self-start lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:mt-0 lg:justify-self-end">
      {canManageMembers ? <AccessPeopleTransferBranch2 model={model} /> : null}
      {canManageProjectAccess || canManageOrganizationAccess ? (
        <AccessPeopleTransferBranch1 model={model} />
      ) : null}
    </CardAction>
  );
}
