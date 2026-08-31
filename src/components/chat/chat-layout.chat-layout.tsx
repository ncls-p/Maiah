"use client";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { ChatAgentSelector } from "@/components/chat/chat-agent-selector";
import { ChatComposerImpact } from "@/components/chat/chat-composer-impact";
import { ChatReasoningSlider } from "@/components/chat/chat-reasoning-slider";
import { useWorkspace } from "@/hooks/use-workspace";
import { ReasoningPreset } from "@/modules/agent/reasoning-presets";
import { ChatLayoutProps, ChatComposerControlsContext } from "./chat-layout.chat-composer-controls-context";
import { SetupWizard } from "@/components/setup/setup-wizard";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function useChatLayoutController(props: ChatLayoutProps) {
  const t = useTranslations("chat");
  const { workspaceId } = useWorkspace();
  const [setupOpen, setSetupOpen] = useState(false);
  const { onReasoningEffortChange } = props;
  const handleReasoningEffortChange = useCallback(
    (value: ReasoningPreset) => {
      onReasoningEffortChange?.(value);
    },
    [onReasoningEffortChange],
  );
  const hasImpact = Boolean(
    props.conversationImpact &&
    (props.conversationImpact.cost !== null ||
      props.conversationImpact.energyKwh !== null),
  );
  const composerControls = {
    primary: (
      <div className="flex min-w-0 flex-nowrap items-center gap-1">
        <ChatAgentSelector
          agents={props.agents}
          selectedAgent={props.selectedAgent}
          activeConversationId={props.activeConversationId}
          conversationIsOwner={props.conversationIsOwner ?? true}
          workspaceId={workspaceId}
          organizationDefaultAgentId={props.organizationDefaultAgentId}
          userDefaultAgentId={props.userDefaultAgentId}
          isLoading={props.isLoading ?? false}
          needsSetup={props.needsSetup ?? false}
          canCreateAgent={props.canCreateAgent ?? false}
          onSelectAgent={props.onSelectAgent}
          onSetUserDefaultAgent={props.onSetUserDefaultAgent}
        />
        {props.reasoningPresets &&
        props.reasoningPresets.length > 0 &&
        props.reasoningEffort != null ? (
          <div className="flex min-h-10 shrink-0 items-center">
            <ChatReasoningSlider
              presets={props.reasoningPresets}
              value={props.reasoningEffort}
              disabled={props.isLoading || props.needsSetup}
              onChange={handleReasoningEffortChange}
            />
          </div>
        ) : null}
      </div>
    ),
    secondary:
      hasImpact && props.conversationImpact ? (
        <ChatComposerImpact impact={props.conversationImpact} />
      ) : null,
  };

  return {
    kind: "ready",
    canRunSetup: props.canRunSetup ?? false,
    children: props.children,
    composerControls,
    onSetupComplete: props.onSetupComplete,
    selectedAgentId: props.selectedAgentId,
    setSetupOpen,
    setupOpen,
    t,
  } as const;
}

export function ChatLayout(
  ...args: Parameters<typeof useChatLayoutController>
) {
  const model = useChatLayoutController(...args);
  if (!("kind" in model)) return model;
  return <ChatLayoutView model={model} />;
}


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

