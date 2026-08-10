import { ModelLogo } from "@/components/providers/model-logo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import type { KnowledgePageViewModel } from "./page.knowledge-page.view";
export function KnowledgeMainSection1({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const {
    attachAgents,
    attachAgentsError,
    attachBaseToAgent,
    attachOpen,
    attachingAgentId,
    loadingAttachAgents,
    openAttachDialog,
    selectedBaseCanEdit,
    setAttachOpen,
    t,
    tCommon,
  } = model;
  return (
    <Dialog
      open={selectedBaseCanEdit && attachOpen}
      onOpenChange={setAttachOpen}
    >
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("attachDialogTitle")}</DialogTitle>
          <DialogDescription>{t("attachDialogDescription")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {loadingAttachAgents ? (
            <div className="flex items-center justify-center py-8">
              <Loader2
                className="size-5 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
            </div>
          ) : attachAgentsError ? (
            <div className="py-6 text-center" role="alert">
              <p className="text-sm text-muted-foreground">
                {t("errorLoadAgents")}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void openAttachDialog()}
              >
                {t("retry")}
              </Button>
            </div>
          ) : attachAgents.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("noAttachAgents")}
            </p>
          ) : (
            attachAgents.map((agent) => {
              const canAttach = Boolean(agent.canEdit && agent.activeVersionId);
              return (
                <button
                  key={agent.id}
                  type="button"
                  disabled={!canAttach || attachingAgentId !== null}
                  className="flex items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void attachBaseToAgent(agent.id)}
                >
                  <ModelLogo
                    logoUrl={agent.logoUrl}
                    label={agent.name}
                    size="md"
                    imageFit="cover"
                    className="rounded-full"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {agent.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {agent.modelDisplayName || t("agentNeedsModel")}
                    </span>
                  </span>
                  {attachingAgentId === agent.id ? (
                    <Loader2
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAttachOpen(false)}>
            {tCommon("cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
