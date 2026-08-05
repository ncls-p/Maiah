import { ShieldIcon } from "lucide-react";

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
export function AccessPeopleBranch3({ model }: { model: AccessConsoleViewModel }) {
  const { peopleQuery, t } = model;
  return (
    <Empty className="min-h-52">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ShieldIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{peopleQuery ? t("noSearchResults") : t("noAssignments")}</EmptyTitle>
        <EmptyDescription>{peopleQuery ? t("noSearchResultsDescription") : t("noAssignmentsDescription")}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
