import type { KnowledgePageViewModel } from "./page.knowledge-page.view";
import { RagConfigFields } from "./page.rag-config-fields";
export function KnowledgePageBranch4({ model }: { model: KnowledgePageViewModel }) {
  const { baseForm, canManageModels, discoveringRagModels, ragModels, setBaseForm } = model;
  return <RagConfigFields idPrefix="create-rag" config={baseForm.ragConfig} onChange={(ragConfig) => setBaseForm({ ...baseForm, ragConfig })} canManageModels={canManageModels} models={ragModels} discoveringModels={discoveringRagModels} />;
}
