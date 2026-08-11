import { ResourceAccessDialog } from "@/components/resource-access-dialog";
import { AdvancedSection } from "@/components/ui/advanced-section";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { WorkspacePage } from "@/components/workspace-page";
import { cloneRagConfig } from "./page.knowledge-base";
import type { useKnowledgePageController } from "./page.knowledge-page";
import { KnowledgePageBranch1 } from "./page.knowledge-page.view.branch-1";
import { KnowledgePageBranch2 } from "./page.knowledge-page.view.branch-2";
import { KnowledgePageBranch3 } from "./page.knowledge-page.view.branch-3";
import { KnowledgePageBranch4 } from "./page.knowledge-page.view.branch-4";
import { KnowledgePageBranch5 } from "./page.knowledge-page.view.branch-5";
import { KnowledgePageBranch6 } from "./page.knowledge-page.view.branch-6";

export type KnowledgePageViewModel = Extract<
  ReturnType<typeof useKnowledgePageController>,
  { kind: "ready" }
>;
export function KnowledgePageView({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const {
    accessBase,
    baseForm,
    bases,
    canManageKnowledgeBases,
    canManageTenantGlobals,
    createBase,
    defaultRagConfig,
    deleteBase,
    deleteDocument,
    deleting,
    loading,
    pendingDelete,
    resourceAccessOptions,
    saveBaseAccess,
    setAccessBase,
    setBaseForm,
    setPendingDelete,
    setShowCreateDialog,
    showCreateDialog,
    t,
    tCommon,
  } = model;
  return (
    <WorkspacePage
      title={t("orbitTitle")}
      accentTitle={t("orbitAccent")}
      eyebrow={t("orbitEyebrow")}
      description={t("orbitDescription")}
      width="wide"
      actions={
        canManageKnowledgeBases && !loading && bases.length > 0 ? (
          <KnowledgePageBranch6 model={model} />
        ) : null
      }
    >
      <Dialog
        open={canManageKnowledgeBases && showCreateDialog}
        onOpenChange={setShowCreateDialog}
      >
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("createBaseTitle")}</DialogTitle>
            <DialogDescription>{t("createBaseDescription")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Label htmlFor="knowledge-name">{t("name")}</Label>
            <Input
              id="knowledge-name"
              name="knowledge-name"
              autoComplete="off"
              value={baseForm.name}
              onChange={(e) =>
                setBaseForm({ ...baseForm, name: e.target.value })
              }
            />
            <Label htmlFor="knowledge-description">
              {t("descriptionLabel")}
            </Label>
            <Input
              id="knowledge-description"
              name="knowledge-description"
              autoComplete="off"
              value={baseForm.description}
              onChange={(e) =>
                setBaseForm({ ...baseForm, description: e.target.value })
              }
            />
            {canManageTenantGlobals ? (
              <KnowledgePageBranch5 model={model} />
            ) : null}
            <AdvancedSection
              label={t("ragAdvanced")}
              hint={t("ragCreateAdvancedHint")}
              storageKey="advanced:knowledge-create-rag-config"
            >
              <div className="grid gap-4">
                <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
                  <Checkbox
                    id="knowledge-custom-rag"
                    checked={baseForm.customizeRag}
                    onCheckedChange={(checked) =>
                      setBaseForm({
                        ...baseForm,
                        customizeRag: checked === true,
                        ragConfig: checked
                          ? cloneRagConfig(baseForm.ragConfig)
                          : cloneRagConfig(defaultRagConfig),
                      })
                    }
                  />
                  <div className="grid gap-1.5">
                    <Label htmlFor="knowledge-custom-rag">
                      {t("ragCustomLabel")}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t("ragCreateCustomHint")}
                    </p>
                  </div>
                </div>
                {baseForm.customizeRag ? (
                  <KnowledgePageBranch4 model={model} />
                ) : null}
              </div>
            </AdvancedSection>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              onClick={() => void createBase()}
              disabled={!baseForm.name.trim()}
            >
              {tCommon("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {loading ? (
        <KnowledgePageBranch3 model={model} />
      ) : bases.length === 0 ? (
        <KnowledgePageBranch2 model={model} />
      ) : (
        <KnowledgePageBranch1 model={model} />
      )}
      {resourceAccessOptions ? (
        <ResourceAccessDialog
          open={accessBase !== null}
          workspaceId={model.workspaceId}
          resource={
            accessBase
              ? {
                  id: accessBase.id,
                  name: accessBase.name,
                  type: "knowledge_base",
                }
              : null
          }
          selection={accessBase?.access ?? { scope: "private" }}
          options={resourceAccessOptions}
          onOpenChangeAction={(open) => {
            if (!open) setAccessBase(null);
          }}
          onScopeSaveAction={saveBaseAccess}
          onSavedAction={model.loadBases}
        />
      ) : null}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.kind === "document"
                ? t("confirmDeleteDocument")
                : t("confirmDeleteBase")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.kind === "document"
                ? t("deleteDocumentDescription", {
                    name: pendingDelete?.name ?? "",
                  })
                : t("deleteBaseDescription", {
                    name: pendingDelete?.name ?? "",
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {tCommon("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting || !pendingDelete}
              onClick={(event) => {
                event.preventDefault();
                if (!pendingDelete) return;
                if (pendingDelete.kind === "document") {
                  void deleteDocument(pendingDelete.id);
                } else {
                  void deleteBase(pendingDelete.id);
                }
              }}
            >
              {deleting ? t("deleting") : tCommon("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WorkspacePage>
  );
}
