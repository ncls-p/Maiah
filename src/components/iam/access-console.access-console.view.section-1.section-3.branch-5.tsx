import type { AccessConsoleViewModel } from "./access-console.access-console.view";
import { AccessPeopleTransferBranch1 } from "./access-console.access-console.view.section-1.section-3.branch-5.branch-1";
import { AccessInviteDialog } from "./access-invite-dialog";

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
    <div className="flex flex-wrap items-center justify-end gap-2">
      {canManageMembers ? <AccessInviteDialog model={model} /> : null}
      {canManageProjectAccess || canManageOrganizationAccess ? (
        <AccessPeopleTransferBranch1 model={model} />
      ) : null}
    </div>
  );
}
