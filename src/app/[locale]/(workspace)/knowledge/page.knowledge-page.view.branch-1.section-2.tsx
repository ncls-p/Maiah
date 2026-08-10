import { AdvancedSection } from "@/components/ui/advanced-section";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { KnowledgePageViewModel } from "./page.knowledge-page.view";
import { RagConfigFields } from "./page.rag-config-fields";
export function KnowledgeMainSection2({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const {
    canManageKnowledgeBases,
    canManageModels,
    canManageTenantGlobals,
    discoveringRagModels,
    editBaseForm,
    editingBase,
    ragModels,
    setEditBaseForm,
    setEditingBase,
    t,
    tCommon,
    updateBase,
  } = model;
  return (
    <Dialog
      open={Boolean(editingBase?.canEdit) && canManageKnowledgeBases}
      onOpenChange={() => setEditingBase(null)}
    >
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("editBaseTitle")}</DialogTitle>
          <DialogDescription>{t("editBaseDescription")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Label htmlFor="edit-knowledge-name">{t("name")}</Label>
          <Input
            id="edit-knowledge-name"
            name="edit-knowledge-name"
            autoComplete="off"
            value={editBaseForm.name}
            onChange={(e) =>
              setEditBaseForm({ ...editBaseForm, name: e.target.value })
            }
          />
          <Label htmlFor="edit-knowledge-description">
            {t("descriptionLabel")}
          </Label>
          <Input
            id="edit-knowledge-description"
            name="edit-knowledge-description"
            autoComplete="off"
            value={editBaseForm.description}
            onChange={(e) =>
              setEditBaseForm({
                ...editBaseForm,
                description: e.target.value,
              })
            }
          />
          {canManageTenantGlobals ? (
            <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
              <Checkbox
                id="edit-knowledge-global"
                checked={editBaseForm.isGlobal}
                onCheckedChange={(checked) =>
                  setEditBaseForm({
                    ...editBaseForm,
                    isGlobal: checked === true,
                  })
                }
              />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="edit-knowledge-global">
                  {t("globalLabel")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("globalDescription")}
                </p>
              </div>
            </div>
          ) : null}
          <AdvancedSection
            label={t("ragAdvanced")}
            hint={t("ragAdvancedHint")}
            storageKey="advanced:knowledge-rag-config"
          >
            <div className="grid gap-4">
              <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
                <Checkbox
                  id="edit-knowledge-custom-rag"
                  checked={editBaseForm.customizeRag}
                  onCheckedChange={(checked) =>
                    setEditBaseForm({
                      ...editBaseForm,
                      customizeRag: checked === true,
                    })
                  }
                />
                <div className="grid gap-1.5">
                  <Label htmlFor="edit-knowledge-custom-rag">
                    {t("ragCustomLabel")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("ragCustomHint")}
                  </p>
                </div>
              </div>
              {editBaseForm.customizeRag && editBaseForm.ragConfig ? (
                <RagConfigFields
                  idPrefix="edit-rag"
                  config={editBaseForm.ragConfig}
                  onChange={(ragConfig) =>
                    setEditBaseForm({ ...editBaseForm, ragConfig })
                  }
                  canManageModels={canManageModels}
                  models={ragModels}
                  discoveringModels={discoveringRagModels}
                />
              ) : null}
            </div>
          </AdvancedSection>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditingBase(null)}>
            {tCommon("cancel")}
          </Button>
          <Button
            onClick={() => void updateBase()}
            disabled={!editingBase?.canEdit || !editBaseForm.name.trim()}
          >
            {tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
