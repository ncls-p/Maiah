import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { EyeIcon, Loader2Icon } from "lucide-react";
import { BUTTON_TYPE } from "./skill-manager.button-type";
import { PreviewPanel } from "./skill-manager.preview-panel";
import type { SkillManagerViewModel } from "./skill-manager.skill-manager.view";
export function SkillManagerSection1({
  model,
}: {
  model: SkillManagerViewModel;
}) {
  const {
    canManageTenantGlobals,
    installCommand,
    installGlobal,
    installOpen,
    installSkill,
    installing,
    preview,
    previewSkill,
    previewWorkspaceId,
    previewing,
    setInstallCommand,
    setInstallGlobal,
    setInstallOpen,
    setPreview,
    setPreviewToken,
    setPreviewWorkspaceId,
    t,
    workspaceId,
  } = model;
  return (
    <Dialog open={installOpen} onOpenChange={setInstallOpen}>
      <DialogContent className="max-h-[min(88dvh,780px)] max-w-3xl overflow-y-auto">
        <div>
          <DialogTitle>{t("installTitle")}</DialogTitle>
          <DialogDescription className="mt-1">
            {t("installDescription")}
          </DialogDescription>
        </div>
        <div className="space-y-3">
          <Textarea
            aria-label={t("installCommand")}
            value={installCommand}
            onChange={(event) => {
              setInstallCommand(event.target.value);
              setPreview(null);
              setPreviewToken(null);
              setPreviewWorkspaceId(null);
            }}
            placeholder="npx skills add anthropics/skills --skill skill-creator"
            className="min-h-20 font-mono text-sm"
          />
          {canManageTenantGlobals ? (
            <label
              htmlFor="skill-install-global"
              className="flex items-start gap-3 rounded-xl border border-border/65 bg-muted/20 p-3"
            >
              <Checkbox
                id="skill-install-global"
                checked={installGlobal}
                onCheckedChange={(checked) =>
                  setInstallGlobal(checked === true)
                }
              />
              <span className="grid gap-1">
                <span className="text-sm font-medium">
                  {t("installGlobalLabel")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("installGlobalHint")}
                </span>
              </span>
            </label>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-muted-foreground">
              {t("explicitHintPrefix")} <code>--skill name</code>{" "}
              <code>owner/repo@skill</code>. {t("explicitHintSuffix")}
            </p>
            <Button
              type={BUTTON_TYPE}
              variant="outline"
              className="shrink-0"
              onClick={() => void previewSkill()}
              disabled={previewing || installing || !installCommand.trim()}
            >
              {previewing ? (
                <Loader2Icon
                  data-icon="inline-start"
                  className="animate-spin"
                />
              ) : (
                <EyeIcon data-icon="inline-start" aria-hidden="true" />
              )}
              {t("previewAction")}
            </Button>
          </div>
        </div>
        {preview && previewWorkspaceId === workspaceId ? (
          <PreviewPanel
            preview={preview}
            onInstall={installSkill}
            installing={installing}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
