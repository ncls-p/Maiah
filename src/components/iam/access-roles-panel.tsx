import { PermissionMatrix } from "./permission-matrix";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
import { AccessRolesSection1 } from "./access-console.access-console.view.section-1.section-1.section-1";
import { AccessRolesSection2 } from "./access-console.access-console.view.section-1.section-1.section-2";

export function AccessRolesPanel({
  model,
}: {
  model: AccessConsoleViewModel;
}) {
  return (
    <div className="flex flex-col gap-4">
      <AccessRolesSection1
        model={model}
        action={<AccessRolesSection2 model={model} />}
      />
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer font-medium">
          {model.t("simpleAccess.viewMatrix")}
        </summary>
        <div className="pt-4">
          <PermissionMatrix
            snapshot={model.snapshot}
            roleLabel={model.roleLabel}
          />
        </div>
      </details>
    </div>
  );
}
