import { SetupWizard } from "@/components/setup/setup-wizard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChatComposerControlsContext } from "./chat-layout.chat-composer-controls-context";
import type { useChatLayoutController } from "./chat-layout.chat-layout";

type Model = Extract<
  ReturnType<typeof useChatLayoutController>,
  { kind: "ready" }
>;
export function ChatLayoutView({ model }: { model: Model }) {
  const {
    canRunSetup,
    children,
    composerControls,
    onSetupComplete,
    selectedAgentId,
    setSetupOpen,
    setupOpen,
    t,
  } = model;
  return (
    <ChatComposerControlsContext.Provider value={composerControls}>
      <div className="chat-shell-brand flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        {children}

        <Dialog open={canRunSetup && setupOpen} onOpenChange={setSetupOpen}>
          <DialogContent className="max-h-[calc(100svh-2rem)] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("finishSetup")}</DialogTitle>
              <DialogDescription>
                {t("setupDialogDescription")}
              </DialogDescription>
            </DialogHeader>
            <SetupWizard
              mode="dialog"
              initialAgentId={selectedAgentId}
              onCancelAction={() => setSetupOpen(false)}
              onCompleteAction={() => {
                setSetupOpen(false);
                onSetupComplete?.();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
    </ChatComposerControlsContext.Provider>
  );
}
