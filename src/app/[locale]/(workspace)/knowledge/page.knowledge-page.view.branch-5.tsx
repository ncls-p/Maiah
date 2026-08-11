import { ResourceAccessScopePicker } from "@/components/agent-access-scope-picker";
import type { KnowledgePageViewModel } from "./page.knowledge-page.view";

export function KnowledgePageBranch5({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const { baseForm, resourceAccessOptions, setBaseForm } = model;
  if (!resourceAccessOptions) return null;
  return (
    <ResourceAccessScopePicker
      value={baseForm.accessScope}
      teamId={baseForm.accessTeamId}
      options={resourceAccessOptions}
      copyNamespace="resourceAccessScope"
      onChangeAction={(accessScope, accessTeamId) =>
        setBaseForm({
          ...baseForm,
          accessScope,
          accessTeamId: accessTeamId ?? "",
        })
      }
    />
  );
}
